/**
 * gemini-tool-prototype.ts
 * Task 2.3 — Gemini Tool Use Strategy for Blockchain Analytics
 *
 * Standalone research script that tests Gemini function-calling via Vertex AI
 * for blockchain analytics use cases.
 *
 * Prerequisites:
 *   - gcloud auth application-default login  (ADC)
 *   - GOOGLE_CLOUD_PROJECT env var set
 *   - DUNE_API_KEY env var set
 *
 * Run:
 *   npm install
 *   npx tsx gemini-tool-prototype.ts
 */

import { generateText, tool, zodSchema, stepCountIs } from "ai";
import type { ModelMessage, ToolCallPart } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";
const DUNE_API_KEY = process.env.DUNE_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const MAX_DUNE_ROWS = 500;
const DUNE_TIMEOUT_MS = 30_000;

if (!GOOGLE_API_KEY) {
  console.error("ERROR: GOOGLE_API_KEY env var is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Google Generative AI client
// ---------------------------------------------------------------------------

const google = createGoogleGenerativeAI({
  apiKey: GOOGLE_API_KEY,
});

// ---------------------------------------------------------------------------
// Dune REST API client
// ---------------------------------------------------------------------------

interface DuneResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

async function executeDuneQuery(sql: string): Promise<DuneResult> {
  if (!DUNE_API_KEY) {
    console.log("  [Dune mock] No API key — returning mock result");
    return {
      columns: ["day", "tx_count"],
      rows: [
        { day: "2025-03-01", tx_count: 142_530 },
        { day: "2025-03-02", tx_count: 151_204 },
        { day: "2025-03-03", tx_count: 138_820 },
      ],
      rowCount: 3,
      executionTimeMs: 0,
      truncated: false,
    };
  }

  const headers = {
    "x-dune-api-key": DUNE_API_KEY,
    "Content-Type": "application/json",
  };

  // Step 1: Create query
  const createRes = await fetch("https://api.dune.com/api/v1/query", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `chat-dune-proto-${Date.now()}`,
      query: sql,
      is_private: true,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Dune create query failed: ${createRes.status} — ${err}`);
  }
  const { query_id } = (await createRes.json()) as { query_id: number };

  // Step 2: Execute
  const execRes = await fetch(
    `https://api.dune.com/api/v1/query/${query_id}/execute`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ performance: "medium" }),
    }
  );
  if (!execRes.ok) {
    const err = await execRes.text();
    throw new Error(`Dune execute failed: ${execRes.status} — ${err}`);
  }
  const { execution_id } = (await execRes.json()) as { execution_id: string };

  // Step 3: Poll for results
  const deadline = Date.now() + DUNE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(1_500);
    const resultsRes = await fetch(
      `https://api.dune.com/api/v1/execution/${execution_id}/results`,
      { headers: { "x-dune-api-key": DUNE_API_KEY } }
    );
    if (!resultsRes.ok) {
      const err = await resultsRes.text();
      throw new Error(`Dune results fetch failed: ${resultsRes.status} — ${err}`);
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
      const rows = data.result!.rows.slice(0, MAX_DUNE_ROWS);
      const truncated = data.result!.metadata.total_row_count > MAX_DUNE_ROWS;
      return {
        columns: data.result!.metadata.column_names,
        rows,
        rowCount: data.result!.metadata.total_row_count,
        executionTimeMs: data.result!.metadata.execution_time_millis,
        truncated,
      };
    }
    if (data.state === "QUERY_STATE_FAILED") {
      throw new Error(`Dune query failed: ${data.error ?? "unknown error"}`);
    }
    console.log(`  [Dune] state=${data.state} — polling...`);
  }

  throw new Error(`Dune query timed out after ${DUNE_TIMEOUT_MS}ms`);
}

// ---------------------------------------------------------------------------
// Mock address mapping store
// ---------------------------------------------------------------------------

const MOCK_MAPPINGS: Record<
  string,
  { name: string; entity: string; category: string }
> = {
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": {
    name: "ETH Token",
    entity: "StarkGate",
    category: "token",
  },
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": {
    name: "STRK Token",
    entity: "Starknet Foundation",
    category: "token",
  },
  "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": {
    name: "USDC Token",
    entity: "Circle",
    category: "token",
  },
  "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b": {
    name: "Ekubo Core",
    entity: "Ekubo Protocol",
    category: "dex",
  },
  "0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f": {
    name: "AVNU Exchange",
    entity: "AVNU",
    category: "dex",
  },
};

// ---------------------------------------------------------------------------
// Chart spec Zod schema (mirrors SPEC.md ChartSpec)
// ---------------------------------------------------------------------------

const ChartSpecSchema = z.object({
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
  data: z.array(z.record(z.unknown())),
  nodes: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .optional(),
  links: z
    .array(
      z.object({ source: z.string(), target: z.string(), value: z.number() })
    )
    .optional(),
});

type ChartSpec = z.infer<typeof ChartSpecSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Starknet blockchain analytics copilot. You help users explore and visualize onchain data using natural language.

## Available Data Sources

### Dune Analytics (PRIMARY — prefer for all historical queries)
Use the execute_dune_query tool to run DuneSQL queries against Starknet data.

Available Starknet tables:
- starknet.blocks — partition key: date, cols: time, number, tx_count
- starknet.transactions — partition key: block_date, cols: block_time, hash, sender_address, type, actual_fee_amount, actual_fee_unit, execution_status, revert_reason
- starknet.events — partition key: block_date, cols: block_time, tx_hash, contract_address, keys (array), data (array)
- starknet.calls — partition key: block_date, cols: block_time, tx_hash, contract_address, function_selector

### Known Event Selectors (Starknet)
Event selectors are Poseidon hashes. Filter starknet.events by keys[1] (1-indexed).

ERC-20 Transfer: 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9
- keys[1] = selector
- data[1] = from, data[2] = to, data[3] = amount_low (u128), data[4] = amount_high (u128)
- Amount: bytearray_to_uint256(data[3], data[4]) / 1e18 for 18-decimal tokens

Ekubo Swapped: 0x157717ac2eb3f6e8f96b1c58e04059aa56b5d7e82da1d5d52f2a8d8cb9a7254
- keys[1] = selector, keys[2] = pool_key_hash

AVNU Swap: 0x1dacf6b8e4b3a07468d1453f89ec68f2c8eac74fa3b88b704ad40b53b63e5a8
- keys[1] = selector, data[1] = taker address

### Known Contract Addresses
- ETH Token: 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
- STRK Token: 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
- USDC Token: 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8
- Ekubo Core: 0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b
- AVNU Exchange: 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f

### Starknet RPC (FALLBACK — real-time data only)
Use fetch_rpc_data only when Dune cannot answer (e.g., current block number, contract state reads).

## Address Mappings
Use lookup_address_mappings when you encounter hex addresses in results. Always look up before rendering charts.

## Output Rules
1. Always produce a chart when data is visualizable — call render_chart with complete data.
2. Never show SQL to the user unless explicitly asked.
3. Prefer Dune for any data older than ~15 minutes.
4. Always include WHERE block_date >= DATE '...' or WHERE date >= DATE '...' for performance.
5. For ERC-20 amounts: bytearray_to_uint256(data[3], data[4]) / 1e18 for 18-decimal tokens.

## Chart Spec Format (render_chart)
{
  type: "line" | "bar" | "pie" | "histogram" | "sankey",
  title: string,
  description?: string,
  xAxis?: { label: string, key: string },
  yAxis?: { label: string, key: string },
  series: [{ name: string, dataKey: string, color?: string }],
  data: [{ [key]: value }]
}

Example line chart:
{
  "type": "line",
  "title": "Daily Transactions",
  "xAxis": { "label": "Date", "key": "day" },
  "yAxis": { "label": "Transactions", "key": "tx_count" },
  "series": [{ "name": "Transactions", "dataKey": "tx_count" }],
  "data": [{ "day": "2025-03-01", "tx_count": 142530 }]
}`;

// ---------------------------------------------------------------------------
// Tool definitions (Vercel AI SDK v6)
// ---------------------------------------------------------------------------

const tools = {
  execute_dune_query: tool({
    description:
      "Execute a DuneSQL query against Starknet data. Returns columns and rows. Use for any historical blockchain analytics.",
    inputSchema: zodSchema(
      z.object({
        sql: z
          .string()
          .describe(
            "The DuneSQL query to execute. Always include a date partition filter."
          ),
        description: z
          .string()
          .describe("1-sentence description of what this query computes"),
      })
    ),
    execute: async ({
      sql,
      description,
    }: {
      sql: string;
      description: string;
    }) => {
      console.log(`\n  → execute_dune_query: ${description}`);
      console.log(`    SQL: ${sql.slice(0, 140).replace(/\n/g, " ")}...`);
      try {
        const result = await executeDuneQuery(sql);
        console.log(
          `    Result: ${result.rowCount} rows (${result.executionTimeMs}ms)${result.truncated ? " [TRUNCATED]" : ""}`
        );
        return {
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
          ...(result.truncated
            ? {
                note: `Result truncated to ${MAX_DUNE_ROWS} rows. Total: ${result.rowCount}.`,
              }
            : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`    ERROR: ${message}`);
        return { error: message };
      }
    },
  }),

  render_chart: tool({
    description:
      "Signal the frontend to render a chart. Call after query results are ready. Include complete data in the spec.",
    inputSchema: zodSchema(
      z.object({
        spec: ChartSpecSchema.describe(
          "Complete chart specification including all data points"
        ),
      })
    ),
    execute: async ({ spec }: { spec: ChartSpec }) => {
      const parse = ChartSpecSchema.safeParse(spec);
      if (!parse.success) {
        console.log(
          `\n  → render_chart: INVALID SPEC — ${parse.error.message}`
        );
        return { error: `Invalid chart spec: ${parse.error.message}` };
      }
      console.log(
        `\n  → render_chart: type=${spec.type}, title="${spec.title}", dataPoints=${spec.data.length}`
      );
      return { rendered: true, chartType: spec.type };
    },
  }),

  lookup_address_mappings: tool({
    description:
      "Look up human-readable labels for Starknet/Ethereum addresses from the workspace address mapping store.",
    inputSchema: zodSchema(
      z.object({
        addresses: z.array(z.string()).describe("Hex addresses to look up"),
      })
    ),
    execute: async ({ addresses }: { addresses: string[] }) => {
      console.log(
        `\n  → lookup_address_mappings: ${addresses.length} addresses`
      );
      const mappings = Object.fromEntries(
        addresses.map((addr) => [
          addr,
          MOCK_MAPPINGS[addr.toLowerCase()] ?? null,
        ])
      );
      const found = Object.values(mappings).filter(Boolean).length;
      console.log(`    Found ${found}/${addresses.length} known addresses`);
      return mappings;
    },
  }),

  fetch_rpc_data: tool({
    description:
      "Call a Starknet RPC method for real-time data not in Dune. Use sparingly.",
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
      chain,
    }: {
      method: string;
      params: unknown[];
      chain: string;
    }) => {
      console.log(`\n  → fetch_rpc_data: ${chain}.${method}`);
      if (method === "starknet_blockNumber") {
        return { result: 842_150 };
      }
      return {
        error: "RPC not wired in prototype — use Dune for historical data",
      };
    },
  }),
};

// ---------------------------------------------------------------------------
// Conversation runner
// ---------------------------------------------------------------------------

interface RunResult {
  scenario: string;
  turnCount: number;
  toolCallNames: string[];
  chartsRendered: number;
  validChartSpecs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  error?: string;
}

async function runScenario(
  scenario: string,
  turns: string[]
): Promise<RunResult> {
  const messages: ModelMessage[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCallNames: string[] = [];
  let chartsRendered = 0;
  let validChartSpecs = 0;
  const t0 = Date.now();

  console.log(`\n${"═".repeat(70)}`);
  console.log(`SCENARIO: ${scenario}`);
  console.log(`${"═".repeat(70)}`);

  try {
    for (const userMessage of turns) {
      console.log(`\nUser: "${userMessage}"`);
      messages.push({ role: "user", content: userMessage });

      const result = await generateText({
        model: google(GEMINI_MODEL),
        system: SYSTEM_PROMPT,
        messages,
        tools,
        stopWhen: stepCountIs(8),
      });

      // Accumulate token usage
      if (result.usage) {
        inputTokens += result.usage.inputTokens ?? 0;
        outputTokens += result.usage.outputTokens ?? 0;
      }

      // Walk steps to collect tool call metadata
      for (const step of result.steps) {
        for (const tc of (step.toolCalls ?? []) as ToolCallPart[]) {
          toolCallNames.push(tc.toolName);

          if (tc.toolName === "render_chart") {
            chartsRendered++;
            const input = tc.input as { spec: ChartSpec };
            const valid = ChartSpecSchema.safeParse(input?.spec).success;
            if (valid) validChartSpecs++;
            console.log(
              `  Chart spec valid: ${valid} (type=${input?.spec?.type ?? "?"})`
            );
          }
        }
      }

      console.log(
        `\nAssistant: ${result.text.slice(0, 300)}${result.text.length > 300 ? "..." : ""}`
      );

      // Append response to history for the next turn
      messages.push({ role: "assistant", content: result.text });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nSCENARIO ERROR: ${message}`);
    return {
      scenario,
      turnCount: turns.length,
      toolCallNames,
      chartsRendered,
      validChartSpecs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      durationMs: Date.now() - t0,
      error: message,
    };
  }

  return {
    scenario,
    turnCount: turns.length,
    toolCallNames,
    chartsRendered,
    validChartSpecs,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

const TEST_SCENARIOS: { name: string; turns: string[] }[] = [
  // 1. Basic time series
  {
    name: "Daily transaction counts (line chart)",
    turns: [
      "Show me daily transaction counts on Starknet for the last 30 days as a line chart.",
    ],
  },

  // 2. Top-N aggregate
  {
    name: "Top senders by transaction count (bar chart)",
    turns: [
      "Who were the top 10 sender addresses by transaction count on Starknet this month? Show as a bar chart.",
    ],
  },

  // 3. ERC-20 event parsing + address labels
  {
    name: "STRK transfer volume with address labels",
    turns: [
      "Show me daily STRK token transfer volume (in STRK) over the last 14 days. Look up addresses for the top recipients.",
    ],
  },

  // 4. Protocol-specific event query
  {
    name: "Ekubo swap event counts (line chart)",
    turns: [
      "How many swap events did Ekubo have per day over the last 30 days?",
    ],
  },

  // 5. Iterative refinement (multi-turn) — core UX test
  {
    name: "Iterative chart refinement (multi-turn)",
    turns: [
      "Show me daily unique active addresses on Starknet for the last 14 days.",
      "Good. Now make it a bar chart and limit it to the last 7 days.",
      "Also add average transactions per address as a second series.",
    ],
  },

  // 6. Complex query with potential error recovery
  {
    name: "Complex event aggregation query",
    turns: [
      "Show me the STRK token transfer volume breakdown: inflow to Ekubo vs AVNU vs all other addresses, aggregated over the last 30 days as a pie chart.",
    ],
  },

  // 7. RPC vs Dune routing
  {
    name: "RPC vs Dune routing",
    turns: [
      "What is the current Starknet block number?",
      "Now show me how many blocks were produced per hour yesterday.",
    ],
  },

  // 8. Pie chart distribution
  {
    name: "Transaction type distribution (pie chart)",
    turns: [
      "Show me the distribution of Starknet transaction types (INVOKE, DECLARE, DEPLOY, DEPLOY_ACCOUNT) as a pie chart for the last 7 days.",
    ],
  },

  // 9. Address label injection
  {
    name: "Address label injection into chart",
    turns: [
      "Show me the top 5 recipient addresses for ETH token (0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7) transfers on Starknet in the last 7 days. Use address labels where available.",
    ],
  },

  // 10. Cross-protocol comparison
  {
    name: "Cross-protocol swap comparison (dual series)",
    turns: [
      "Compare daily swap event counts between Ekubo and AVNU over the last 30 days. Show both protocols on the same line chart.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCost(tokens: number): string {
  // Gemini 2.0 Flash: ~$0.075/1M input, ~$0.30/1M output; blended ~$0.15/1M
  return `$${((tokens / 1_000_000) * 0.15).toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    "╔══════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║  chat-dune — Gemini Tool Use Prototype (Task 2.3)               ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════╝"
  );
  console.log(`Model:    ${GEMINI_MODEL}`);
  console.log(`API Key:  ${GOOGLE_API_KEY.slice(0, 8)}...`);
  console.log(`Dune API: ${DUNE_API_KEY ? "SET" : "NOT SET (mock mode)"}`);
  console.log();

  const results: RunResult[] = [];

  for (const scenario of TEST_SCENARIOS) {
    const result = await runScenario(scenario.name, scenario.turns);
    results.push(result);
    await sleep(1_000); // pause between scenarios to avoid rate limits
  }

  // ---------------------------------------------------------------------------
  // Summary report
  // ---------------------------------------------------------------------------

  console.log("\n\n" + "═".repeat(70));
  console.log("SUMMARY REPORT");
  console.log("═".repeat(70));

  let totalIn = 0;
  let totalOut = 0;
  let totalTools = 0;
  let totalCharts = 0;
  let totalValidCharts = 0;
  let totalErrors = 0;

  for (const r of results) {
    const status = r.error ? "FAIL" : "PASS";
    const toolStr = [...new Set(r.toolCallNames)].join(", ") || "none";
    console.log(
      `[${status}] ${r.scenario.padEnd(44)} | tools=[${toolStr}] charts=${r.chartsRendered}/${r.validChartSpecs}valid ${r.totalTokens}tok ${r.durationMs}ms`
    );
    if (r.error) console.log(`       ↳ ${r.error}`);
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    totalTools += r.toolCallNames.length;
    totalCharts += r.chartsRendered;
    totalValidCharts += r.validChartSpecs;
    if (r.error) totalErrors++;
  }

  const totalTokens = totalIn + totalOut;
  console.log("\n" + "─".repeat(70));
  console.log(
    `Scenarios: ${results.length}  Failed: ${totalErrors}  Tool calls: ${totalTools}  Charts: ${totalCharts} (${totalValidCharts} valid)`
  );
  console.log(
    `Tokens: ${totalTokens} total (${totalIn} in / ${totalOut} out)  Est. cost: ${formatCost(totalTokens)}`
  );
  const avgTok = Math.round(totalTokens / results.length);
  console.log(`Avg per query: ${avgTok} tokens (~${formatCost(avgTok)} each)`);

  console.log(
    "\n[Done — see research/gemini-strategy.md for analysis and recommendations]\n"
  );
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
