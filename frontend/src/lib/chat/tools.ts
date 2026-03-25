/**
 * Gemini tool definitions for the chat engine.
 * Uses Vercel AI SDK v6 tool() + zodSchema() pattern.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const ChartSpecSchema = z.object({
  type: z.enum(["line", "bar", "pie", "histogram", "sankey"]),
  title: z.string(),
  description: z.string().optional(),
  xAxis: z.object({ label: z.string(), key: z.string() }).optional(),
  yAxis: z.object({ label: z.string(), key: z.string() }).optional(),
  series: z.array(
    z.object({
      name: z.string(),
      dataKey: z.string(),
      color: z.string().optional(),
    })
  ),
  data: z.array(z.record(z.string(), z.unknown())),
  nodes: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  links: z
    .array(
      z.object({ source: z.string(), target: z.string(), value: z.number() })
    )
    .optional(),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "chart"; spec: ChartSpec }
  | { type: "table"; columns: string[]; rows: unknown[][] };

export interface DuneQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated?: boolean;
  note?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Dune REST API executor
// ---------------------------------------------------------------------------

const MAX_DUNE_ROWS = 500;
const DUNE_TIMEOUT_MS = 30_000;

async function executeDuneQueryRest(
  sql: string
): Promise<DuneQueryResult> {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) {
    return { error: "DUNE_API_KEY not configured", columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
  }

  const headers = {
    "x-dune-api-key": apiKey,
    "Content-Type": "application/json",
  };

  const t0 = Date.now();

  // Step 1: Create query
  let queryId: number;
  try {
    const createRes = await fetch("https://api.dune.com/api/v1/query", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `chat-dune-${Date.now()}`,
        query: sql,
        is_private: true,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      return { error: `Dune query creation failed (${createRes.status}): ${err}`, columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
    }
    const createData = (await createRes.json()) as { query_id: number };
    queryId = createData.query_id;
  } catch (err) {
    return { error: `Dune network error: ${String(err)}`, columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
  }

  // Step 2: Execute
  let executionId: string;
  try {
    const execRes = await fetch(
      `https://api.dune.com/api/v1/query/${queryId}/execute`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ performance: "medium" }),
      }
    );
    if (!execRes.ok) {
      const err = await execRes.text();
      if (execRes.status === 429) {
        return { error: "Dune rate limit hit. Please wait a moment before retrying.", columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
      }
      return { error: `Dune execution failed (${execRes.status}): ${err}`, columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
    }
    const execData = (await execRes.json()) as { execution_id: string };
    executionId = execData.execution_id;
  } catch (err) {
    return { error: `Dune network error: ${String(err)}`, columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
  }

  // Step 3: Poll for results
  const deadline = Date.now() + DUNE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_500));

    try {
      const resultsRes = await fetch(
        `https://api.dune.com/api/v1/execution/${executionId}/results`,
        { headers: { "x-dune-api-key": apiKey } }
      );

      if (!resultsRes.ok) {
        const err = await resultsRes.text();
        return { error: `Dune results fetch failed (${resultsRes.status}): ${err}`, columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
      }

      const data = (await resultsRes.json()) as {
        state: string;
        result?: {
          rows: Record<string, unknown>[];
          metadata: {
            column_names: string[];
            total_row_count: number;
            execution_time_millis: number;
          };
        };
        error?: string;
      };

      if (data.state === "QUERY_STATE_COMPLETED") {
        const totalRows = data.result!.metadata.total_row_count;
        const rows = data.result!.rows.slice(0, MAX_DUNE_ROWS);
        const truncated = totalRows > MAX_DUNE_ROWS;
        return {
          columns: data.result!.metadata.column_names,
          rows,
          rowCount: totalRows,
          executionTimeMs: Date.now() - t0,
          truncated,
          ...(truncated
            ? { note: `Result truncated to ${MAX_DUNE_ROWS} rows. Total: ${totalRows}. Add more filters to reduce result size.` }
            : {}),
        };
      }

      if (data.state === "QUERY_STATE_FAILED") {
        return {
          error: `Dune query failed: ${data.error ?? "unknown error"}. Note: Starknet event amounts use bytearray_to_uint256(data[3], data[4]). Array indices are 1-based.`,
          columns: [], rows: [], rowCount: 0, executionTimeMs: Date.now() - t0,
        };
      }

      if (data.state === "QUERY_STATE_CANCELLED") {
        return { error: "Dune query was cancelled.", columns: [], rows: [], rowCount: 0, executionTimeMs: Date.now() - t0 };
      }
    } catch (err) {
      return { error: `Dune polling error: ${String(err)}`, columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
    }
  }

  return {
    error: `Dune query timed out after ${DUNE_TIMEOUT_MS / 1000}s. Try adding a narrower date range or more filters.`,
    columns: [], rows: [], rowCount: 0, executionTimeMs: DUNE_TIMEOUT_MS,
  };
}

// ---------------------------------------------------------------------------
// Tool builders
// ---------------------------------------------------------------------------

export function buildChatTools(
  supabase: SupabaseClient<Database>
) {
  return {
    execute_dune_query: tool({
      description:
        "Execute a DuneSQL query against Starknet (or other chain) data. Returns column names and rows. Use for any historical blockchain analytics. Always include a date partition filter for performance.",
      inputSchema: zodSchema(
        z.object({
          sql: z.string().describe(
            "The DuneSQL query to execute. Always include WHERE block_date >= DATE '...' for starknet.events/transactions, or WHERE date >= DATE '...' for starknet.blocks."
          ),
          description: z.string().describe(
            "1-sentence description of what this query computes"
          ),
        })
      ),
      execute: async ({
        sql,
        description,
      }: {
        sql: string;
        description: string;
      }) => {
        void description; // used for model reasoning quality; logged in production
        return executeDuneQueryRest(sql);
      },
    }),

    render_chart: tool({
      description:
        "Signal the frontend to render a chart. Always include complete data in the spec. Call this after your query succeeds and you have processed the results.",
      inputSchema: zodSchema(
        z.object({
          spec: ChartSpecSchema.describe(
            "Complete chart specification including all data points. Must include data array with at least one row."
          ),
        })
      ),
      execute: async (
        { spec }: { spec: ChartSpec },
        { toolCallId }: { toolCallId: string }
      ) => {
        void toolCallId; // used by route handler to match tool-result stream events
        if (!spec.data || spec.data.length === 0) {
          return {
            error:
              "Chart spec has empty data array. Please wait for query results before calling render_chart.",
          };
        }
        const parse = ChartSpecSchema.safeParse(spec);
        if (!parse.success) {
          return {
            error: `Invalid chart spec: ${parse.error.message}. Please fix the spec and try again.`,
          };
        }
        return { rendered: true, chartType: spec.type };
      },
    }),

    lookup_address_mappings: tool({
      description:
        "Look up human-readable labels for Starknet/Ethereum addresses from the workspace mapping store. Call this before render_chart when addresses appear in query results.",
      inputSchema: zodSchema(
        z.object({
          addresses: z
            .array(z.string())
            .describe("Hex addresses to look up (up to 50 at a time)"),
        })
      ),
      execute: async ({ addresses }: { addresses: string[] }) => {
        const { data } = await supabase
          .from("address_mappings")
          .select("address, name, entity, category")
          .in(
            "address",
            addresses.map((a) => a.toLowerCase())
          );

        const result: Record<
          string,
          { name: string | null; entity: string | null; category: string | null } | null
        > = {};
        for (const addr of addresses) {
          const match = data?.find(
            (m) => m.address === addr.toLowerCase()
          );
          result[addr] = match
            ? { name: match.name, entity: match.entity, category: match.category }
            : null;
        }
        return result;
      },
    }),

    fetch_rpc_data: tool({
      description:
        "Call a Starknet RPC method for real-time or raw data not available in Dune. Use sparingly — only when Dune cannot provide the answer (e.g., current block number, live contract state reads).",
      inputSchema: zodSchema(
        z.object({
          method: z
            .string()
            .describe("JSON-RPC method e.g. starknet_blockNumber"),
          params: z.array(z.unknown()).describe("Method parameters"),
          chain: z.enum(["starknet", "ethereum"]).default("starknet"),
        })
      ),
      execute: async ({
        method,
        params,
        chain,
      }: {
        method: string;
        params: unknown[];
        chain: string;
      }) => {
        const rpcUrl =
          chain === "ethereum"
            ? process.env.ETHEREUM_RPC_URL
            : process.env.STARKNET_RPC_URL;

        if (!rpcUrl) {
          return {
            error: `RPC URL not configured for chain: ${chain}. Set ${chain === "ethereum" ? "ETHEREUM_RPC_URL" : "STARKNET_RPC_URL"} env var.`,
          };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        try {
          const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method,
              params,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!res.ok) {
            return { error: `RPC request failed: ${res.status} ${res.statusText}` };
          }

          const data = (await res.json()) as {
            result?: unknown;
            error?: { code: number; message: string };
          };

          if (data.error) {
            return {
              error: `RPC error ${data.error.code}: ${data.error.message}`,
            };
          }

          return { result: data.result };
        } catch (err) {
          clearTimeout(timeout);
          if (err instanceof Error && err.name === "AbortError") {
            return { error: "RPC request timed out after 10s. Use Dune for historical data instead." };
          }
          return { error: `RPC network error: ${String(err)}` };
        }
      },
    }),
  };
}
