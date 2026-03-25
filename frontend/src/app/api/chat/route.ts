/**
 * POST /api/chat
 *
 * Streaming chat route handler. Accepts a user message + threadId,
 * runs the Gemini function-calling loop via Vercel AI SDK, streams
 * text deltas and chart specs as SSE events, and persists messages
 * to Supabase.
 *
 * SSE event format:
 *   data: {"type":"text-delta","delta":"..."}
 *   data: {"type":"chart-spec","spec":{...ChartSpec}}
 *   data: {"type":"done","finishReason":"stop"}
 *   data: {"type":"error","message":"..."}
 */

import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { NextRequest } from "next/server";
import type { Json } from "@/lib/db/types";
import { createServerClient } from "@/lib/supabase/server";
import { buildChatTools, ChartSpecSchema, type ChartSpec, type MessageContent } from "@/lib/chat/tools";
import { buildSystemPrompt, fetchSystemPromptContext } from "@/lib/chat/system-prompt";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const ChatRequestSchema = z.object({
  threadId: z.string().uuid(),
  message: z.string().min(1).max(8000),
  chain: z.enum(["starknet", "ethereum"]).default("starknet"),
});

// ---------------------------------------------------------------------------
// Conversation history builder
// ---------------------------------------------------------------------------

async function buildConversationHistory(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  threadId: string
) {
  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (!messages) return [];

  return messages.map((msg) => {
    const content = msg.content as MessageContent[];
    const textContent = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return {
      role: msg.role as "user" | "assistant",
      content: textContent,
    };
  });
}

// ---------------------------------------------------------------------------
// Message persister
// ---------------------------------------------------------------------------

async function persistMessage(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  threadId: string,
  role: "user" | "assistant",
  content: MessageContent[]
) {
  await supabase.from("messages").insert({
    thread_id: threadId,
    role,
    content: content as unknown as Json,
  });

  // Update thread updated_at
  await supabase
    .from("threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Auth
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request
  let body: z.infer<typeof ChatRequestSchema>;
  try {
    const raw = await request.json();
    body = ChatRequestSchema.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { threadId, message, chain } = body;

  // 3. Verify thread ownership
  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();

  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  // 4. Persist user message
  await persistMessage(supabase, threadId, "user", [
    { type: "text", text: message },
  ]);

  // 5. Fetch context for system prompt
  const context = await fetchSystemPromptContext(supabase);

  // 6. Build conversation history (includes the message we just persisted)
  const history = await buildConversationHistory(supabase, threadId);

  // 7. Build system prompt
  const systemPrompt = buildSystemPrompt({ ...context, chain });

  // 8. Initialize Gemini
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 });
  }

  const google = createGoogleGenerativeAI({ apiKey });

  // 9. Build tools
  const tools = buildChatTools(supabase);

  // 10. Start streaming
  const result = streamText({
    model: google(GEMINI_MODEL),
    system: systemPrompt,
    messages: history,
    tools,
    stopWhen: stepCountIs(8),
  });

  // 11. Build SSE response stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      let fullText = "";
      const chartsForPersistence: ChartSpec[] = [];

      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            emit({ type: "text-delta", delta: part.text });
            fullText += part.text;
          } else if (
            part.type === "tool-result" &&
            part.toolName === "render_chart"
          ) {
            // The execute function already validated the spec.
            // output.rendered === true means spec was valid.
            const output = part.output as
              | { rendered: true; chartType: string }
              | { error: string };

            if ("rendered" in output && output.rendered) {
              // Re-parse spec from tool call input (already zodSchema-validated)
              const input = part.input as { spec: ChartSpec };
              const parsed = ChartSpecSchema.safeParse(input.spec);
              if (parsed.success) {
                emit({ type: "chart-spec", spec: parsed.data });
                chartsForPersistence.push(parsed.data);
              }
            }
          } else if (part.type === "finish") {
            // Persist assistant message
            const content: MessageContent[] = [];
            if (fullText) content.push({ type: "text", text: fullText });
            for (const spec of chartsForPersistence) {
              content.push({ type: "chart", spec });
            }
            if (content.length > 0) {
              await persistMessage(supabase, threadId, "assistant", content);
            }

            emit({ type: "done", finishReason: part.finishReason });
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
