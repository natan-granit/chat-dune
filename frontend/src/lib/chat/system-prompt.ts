/**
 * System prompt builder for the Gemini chat engine.
 * Generated per-request to inject fresh address mapping and selector context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddressMapping {
  address: string;
  name: string | null;
  entity: string | null;
  category: string | null;
}

interface SelectorEntry {
  selector: string;
  event_name: string;
  protocol: string | null;
  keys_layout: unknown;
  data_layout: unknown;
  contract_addresses: string[];
}

export interface SystemPromptContext {
  addressMappings: AddressMapping[];
  selectors: SelectorEntry[];
  chain?: string;
}

// ---------------------------------------------------------------------------
// Static context blocks
// ---------------------------------------------------------------------------

const ROLE_DEFINITION = `You are a Starknet blockchain analytics copilot. You help users explore and visualize onchain data by writing DuneSQL queries and producing interactive charts. You are precise, analytical, and always prefer data-driven answers with visualizations.`;

const DUNE_TABLES = `## Available Data Sources

### Dune Analytics (PRIMARY — use for all historical queries)
Use execute_dune_query for any blockchain analytics. Always include a date partition filter.

Available Starknet tables and partition keys:
- starknet.blocks — partition key: date; cols: time, number, tx_count, gas_price
- starknet.transactions — partition key: block_date; cols: block_time, hash, sender_address, type, actual_fee_amount, actual_fee_unit, execution_status, revert_reason
- starknet.events — partition key: block_date; cols: block_time, tx_hash, from_address (= contract_address), contract_address, keys (array, 1-indexed), data (array, 1-indexed)
- starknet.calls — partition key: block_date; cols: block_time, tx_hash, contract_address, function_selector

**CRITICAL DuneSQL rules for Starknet events:**
1. Array indexing is 1-based: keys[1] = event selector, keys[2] = first indexed param
2. Use zero-padded 64-char hex selectors (e.g., 0x0099cd8b... not 0x99cd8b...)
3. Add cardinality guards: AND cardinality(keys) >= N before accessing array elements
4. u256 values serialize as two sequential felts: amount_low (bits 0-127) and amount_high (bits 128-255)
5. ERC-20 token amounts: bytearray_to_uint256(data[3], data[4]) / 1e18 for 18-decimal tokens
6. Filter by from_address to target a specific token contract (not by data[1]/data[2])`;

const OUTPUT_RULES = `## Output Rules
1. Always produce a chart when data is visualizable — call render_chart with complete data including all query results.
2. Never show SQL to the user unless they explicitly ask "show me the SQL" or "what query did you run".
3. Use Dune for any data older than ~15 minutes. Use fetch_rpc_data only for current block number, live contract state reads, or pending data.
4. Always include WHERE block_date >= DATE '...' (for events/transactions) or WHERE date >= DATE '...' (for blocks) for query performance.
5. For ERC-20 amounts: bytearray_to_uint256(data[3], data[4]) / 1e18 for 18-decimal tokens.
6. Call lookup_address_mappings before render_chart when raw hex addresses appear in query results.
7. Use line charts for time series, bar charts for rankings/comparisons, pie charts for distributions, sankey for flows.
8. If a query fails with a syntax error, analyze the error and retry with a corrected query.`;

const CHART_SPEC_FORMAT = `## Chart Spec Format (for render_chart)
The spec must be a complete JSON object:
{
  "type": "line" | "bar" | "pie" | "histogram" | "sankey",
  "title": "descriptive title",
  "description": "optional subtitle",
  "xAxis": { "label": "X axis label", "key": "data field name" },
  "yAxis": { "label": "Y axis label", "key": "data field name" },
  "series": [{ "name": "series label", "dataKey": "data field name", "color": "#optional" }],
  "data": [{ "field1": value1, "field2": value2 }]
}

Example line chart:
{
  "type": "line",
  "title": "Daily Starknet Transactions",
  "xAxis": { "label": "Date", "key": "day" },
  "yAxis": { "label": "Transactions", "key": "tx_count" },
  "series": [{ "name": "Transactions", "dataKey": "tx_count" }],
  "data": [{ "day": "2025-03-01", "tx_count": 142530 }, { "day": "2025-03-02", "tx_count": 151204 }]
}

Example bar chart with address labels:
{
  "type": "bar",
  "title": "Top Token Recipients",
  "xAxis": { "label": "Address", "key": "recipient" },
  "yAxis": { "label": "Amount (STRK)", "key": "amount" },
  "series": [{ "name": "Amount", "dataKey": "amount" }],
  "data": [{ "recipient": "Ekubo Protocol", "amount": 1250000 }]
}

Example pie chart:
{
  "type": "pie",
  "title": "Transaction Type Distribution",
  "series": [{ "name": "Count", "dataKey": "count" }],
  "data": [{ "name": "INVOKE", "count": 142530 }, { "name": "DECLARE", "count": 340 }]
}`;

// ---------------------------------------------------------------------------
// Static well-known addresses (always injected — top 8 by query frequency)
// ---------------------------------------------------------------------------

const STATIC_ADDRESSES = `## Known Contract Addresses (always available)
- ETH Token: 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
- STRK Token: 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
- USDC Token: 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8
- USDT Token: 0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8
- Ekubo Core: 0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b
- AVNU Exchange: 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f
- JediSwap V2 Router: 0x06fea5b6438e8a88b3ef2c55c53ab8a0b7ccd7e0836f93a9e8d3e56daaa5b81
- StarkGate ETH Bridge: 0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82`;

// ---------------------------------------------------------------------------
// Context fetchers
// ---------------------------------------------------------------------------

export async function fetchSystemPromptContext(
  supabase: SupabaseClient<Database>
): Promise<SystemPromptContext> {
  const [mappingsResult, selectorsResult] = await Promise.all([
    supabase
      .from("address_mappings")
      .select("address, name, entity, category")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("starknet_selectors")
      .select(
        "selector, event_name, protocol, keys_layout, data_layout, contract_addresses"
      )
      .order("event_name"),
  ]);

  return {
    addressMappings: mappingsResult.data ?? [],
    selectors: (selectorsResult.data ?? []) as SelectorEntry[],
  };
}

// ---------------------------------------------------------------------------
// Selector registry formatter
// ---------------------------------------------------------------------------

function formatSelectorRegistry(selectors: SelectorEntry[]): string {
  if (selectors.length === 0) return "";

  const lines = [
    "## Starknet Event Selector Registry",
    "Filter starknet.events using keys[1] = selector (1-indexed). Use zero-padded 64-char hex.",
    "",
  ];

  for (const s of selectors) {
    const keysLayout = Array.isArray(s.keys_layout)
      ? (s.keys_layout as Array<{ index: number; name: string; type: string }>)
          .map((k) => `keys[${k.index}]=${k.name}(${k.type})`)
          .join(", ")
      : "";
    const dataLayout = Array.isArray(s.data_layout)
      ? (s.data_layout as Array<{ index: number; name: string; type: string }>)
          .map((d) => `data[${d.index}]=${d.name}(${d.type})`)
          .join(", ")
      : "";

    lines.push(
      `${s.protocol ?? "Unknown"} ${s.event_name}: ${s.selector}`
    );
    if (keysLayout) lines.push(`  keys: ${keysLayout}`);
    if (dataLayout) lines.push(`  data: ${dataLayout}`);
    if (s.contract_addresses.length > 0) {
      lines.push(`  contracts: ${s.contract_addresses.slice(0, 3).join(", ")}${s.contract_addresses.length > 3 ? "..." : ""}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Address mapping formatter
// ---------------------------------------------------------------------------

function formatAddressMappings(mappings: AddressMapping[]): string {
  if (mappings.length === 0) return "";

  const obj: Record<string, { name: string | null; entity: string | null; category: string | null }> = {};
  for (const m of mappings) {
    obj[m.address] = { name: m.name, entity: m.entity, category: m.category };
  }

  return [
    "## Workspace Address Mappings (top 100 most recent)",
    "Use these labels when addresses appear in results. Call lookup_address_mappings for addresses not listed here.",
    "```json",
    JSON.stringify(obj, null, 0)
      .replace(/},/g, "},\n")
      .slice(0, 4000), // cap at ~4K chars to limit tokens
    "```",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(context: SystemPromptContext): string {
  const sections: string[] = [
    ROLE_DEFINITION,
    DUNE_TABLES,
    formatSelectorRegistry(context.selectors),
    STATIC_ADDRESSES,
    context.addressMappings.length > 0
      ? formatAddressMappings(context.addressMappings)
      : "",
    OUTPUT_RULES,
    CHART_SPEC_FORMAT,
  ];

  return sections.filter(Boolean).join("\n\n");
}
