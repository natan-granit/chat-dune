# Dune MCP Capabilities Investigation

> **Task**: 2.1 — Research phase deliverable
> **Date**: 2026-03-24
> **Status**: Complete

---

## 1. What Is the Dune MCP Server?

The official Dune MCP server is a **hosted HTTP MCP server** maintained by Dune Analytics.

- **Endpoint**: `https://api.dune.com/mcp/v1`
- **Transport**: HTTP (not stdio — no local process required)
- **Docs**: https://docs.dune.com/api-reference/agents/mcp

There is **no official open-source GitHub repo** for the Dune MCP server. What exists on GitHub are community implementations (e.g., `ekailabs/dune-mcp-server`, `deacix/dune-mcp`) wrapping specific saved queries — they are domain-specific and not general-purpose.

---

## 2. Authentication

API key obtained from `dune.com/settings/api`.

### Adding to Claude Code

```bash
claude mcp add --scope user --transport http dune https://api.dune.com/mcp/v1 \
  --header "x-dune-api-key: <your-dune-api-key>"
```

### HTTP Header

```
x-dune-api-key: <your-dune-api-key>
```

Also accepted as query param `?api_key=<key>` but header is preferred.

---

## 3. MCP Tools — Full Reference

The official server exposes **12 tools** across four categories.

### 3.1 Discovery Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `searchDocs` | Search Dune documentation | `query: string` |
| `searchTables` | Find tables by protocol, chain, or keyword | `query: string` |
| `listBlockchains` | List all indexed chains with table counts | — |
| `searchTablesByContractAddress` | Find decoded event/call tables for a contract | `contract_address: string` |

> **Note**: `searchTablesByContractAddress` is EVM-specific. It relies on Dune's ABI submission + auto-decode pipeline, which does **not** exist for Starknet. For Starknet, use `searchTables` and query raw tables directly.

### 3.2 Query Lifecycle Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `createDuneQuery` | Create and save a new query | `sql: string`, `title: string`, `description?: string`, `tags?: string[]` |
| `getDuneQuery` | Retrieve SQL and metadata for a saved query | `query_id: number` |
| `updateDuneQuery` | Update an existing saved query | `query_id: number`, `sql?: string`, `title?: string`, `parameters?: object` |
| `executeQueryById` | Execute a saved query | `query_id: number`, `query_parameters?: object`, `performance?: "medium" \| "large"` |
| `getExecutionResults` | Poll for results of a running execution | `execution_id: string` |

### 3.3 Visualization Tool

| Tool | Description |
|---|---|
| `generateVisualization` | Create line, bar, area charts, counters, or tables from execution results |

> For chat-dune, this tool is **not relevant** — we generate our own chart specs via Claude's `render_chart` tool and render them with Recharts/ECharts on the frontend.

### 3.4 Account Tool

| Tool | Description |
|---|---|
| `getUsage` | Return credit consumption for the current billing period |

---

## 4. Query Execution Model

Execution is **asynchronous** — trigger and poll.

### Execution Flow

```
createDuneQuery(sql) → query_id
       ↓
executeQueryById(query_id) → execution_id + state=PENDING
       ↓
getExecutionResults(execution_id) → poll until is_execution_finished=true
       ↓
result.rows, result.metadata.column_names, result.metadata.row_count
```

### Execution States

| State | Meaning |
|---|---|
| `QUERY_STATE_PENDING` | Queued |
| `QUERY_STATE_EXECUTING` | Running |
| `QUERY_STATE_COMPLETED` | Success — results available |
| `QUERY_STATE_FAILED` | Query error — check error message |
| `QUERY_STATE_CANCELLED` | User-cancelled |

### Result Response Structure

```json
{
  "execution_id": "01HKZJ...",
  "query_id": 12345,
  "state": "QUERY_STATE_COMPLETED",
  "is_execution_finished": true,
  "result": {
    "rows": [{ "col1": "val1", ... }, ...],
    "metadata": {
      "column_names": ["col1", "col2"],
      "column_types": ["varchar", "bigint"],
      "row_count": 100,
      "total_row_count": 5000
    }
  },
  "execution_time_millis": 3200,
  "pending_time_millis": 150
}
```

### Recommended Pattern for chat-dune

Since MCP is async, the tool call handler in `lib/dune/client.ts` should:
1. Call `createDuneQuery` (or reuse a saved query if it already exists)
2. Call `executeQueryById`
3. Poll `getExecutionResults` in a loop (e.g., every 500ms) until finished or timeout
4. Return normalized `{ columns, rows }` to Claude

---

## 5. Rate Limits

| Plan | Write-heavy ops (rpm) | Read-heavy ops (rpm) |
|---|---|---|
| Free | 15 | 40 |
| Plus | 70 | 200 |
| Enterprise | 350+ | 1000+ |

Write-heavy = query creation/updates, triggering executions.
Read-heavy = result fetching, status checks.

**Universal cap**: 1000 req/sec per IP (not a concern in practice).

### Engine Tiers

| Engine | Timeout | Cost | Notes |
|---|---|---|---|
| Small (free) | 2 minutes | Free | Community cluster; max 3 concurrent |
| Medium | 30 minutes | Credits | Default for paid tiers |
| Large | 30 minutes | ~2× credits | Higher compute, same max timeout |

---

## 6. Limitations

| Limit | Value | Notes |
|---|---|---|
| Max result size | 32 GB | Use `allow_partial_results=true` above this threshold |
| Max result size (CSV endpoint) | 8 GB | |
| Default datapoints per call | 250,000 | Guard against accidental credit drain |
| Small engine timeout | 2 minutes | Free plan |
| Medium/Large timeout | 30 minutes | Maximum — cannot be extended |
| Result retention | 90 days | Cached; re-execution needed after expiry |
| MCP client default timeout | 60 seconds | Override with `tool_timeout_sec: 300` in config to avoid early disconnect |

### Unsupported Query Types

- GraphQL — DuneSQL only
- Streaming results — poll-based only
- Native result pagination via API (use SQL `LIMIT`/`OFFSET`)
- `LIST` parameter type in query views

### chat-dune Application Limits to Enforce

- **Truncate results to 500 rows** in `lib/dune/client.ts` before returning to Claude (per task 3.4 spec)
- **30-second tool timeout** configured in the chat route handler (free/small engine may finish in <2 min on simple queries; for complex ones on paid tier we can wait up to 30s before surfacing a timeout error to Claude)

---

## 7. Starknet Data on Dune — Critical Finding

**Dune supports native Starknet data** — not just bridged assets. Starknet is indexed as a first-class chain with 4 raw tables.

### 7.1 Available Tables

#### `starknet.blocks`

Key columns: `date`, `number`, `time`, `tx_count`, `hash`, `l1_da_mode`, `l1_gas_price_in_fri`, `l1_gas_price_in_wei`, `l2_gas_price_in_fri`, `l2_gas_price_in_wei`, `starknet_version`, `sequencer_address`, `state_diff`

#### `starknet.transactions`

Key columns: `block_date`, `block_time`, `block_number`, `type` (INVOKE/DECLARE/DEPLOY_ACCOUNT/DEPLOY/L1_HANDLER), `version`, `sender_address`, `contract_address`, `transaction_hash`, `actual_fee_amount`, `actual_fee_unit` (wei or fri), `execution_status`, `finality_status` (ACCEPTED_ON_L1/ACCEPTED_ON_L2), `calldata` (ARRAY(VARBINARY)), `revert_reason`

Full execution resource columns available: `pedersen`, `poseidon`, `ecdsa`, `keccak`, `bitwise`, `range_check`, `ec_op`, `memory_holes`, `steps`

#### `starknet.events`

Key columns: `block_date`, `block_time`, `block_number`, `block_status`, `event_index`, `transaction_hash`, `from_address`, `keys` (ARRAY(VARBINARY)), `data` (ARRAY(VARBINARY)), `class_hash`

> `keys[0]` is the event selector (Poseidon hash of the event name). `keys[1..]` are indexed event parameters. `data` contains non-indexed parameters.

#### `starknet.calls`

Key columns: `block_date`, `block_time`, `block_number`, `transaction_hash`, `transaction_index`, `call_type`, `entry_point_selector`, `contract_address`, `caller_address`, `calldata` (ARRAY(VARBINARY)), `result` (VARBINARY), `revert_reason`, `callstack_index`, `events` (ARRAY(ROW)), `messages` (ARRAY(ROW))

### 7.2 What Does NOT Exist for Starknet

| Missing | Impact |
|---|---|
| Decoded contract tables | No `starknet_erc20_evt_transfer` style tables. Must filter `starknet.events` by selector. |
| Token transfer spells | No `starknet.tokens.transfers` or equivalent abstraction |
| DEX trade tables | No `dex.trades` for Starknet (only EVM chains) |
| NFT tables | No decoded NFT events |
| Labels / entity tables | No `starknet.labels` — workspace address mappings from chat-dune fill this gap |

### 7.3 Recommended Workarounds

**ERC-20 Transfer events**: filter `starknet.events` where `keys[0]` equals the Poseidon hash of `"Transfer"`. For STRK token: `from_address = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`

**Token prices**: `prices.usd` table includes STRK by contract address. Join on `contract_address` for USD conversion.

**Protocol activity**: query `starknet.transactions` by `contract_address` for known protocol contracts; join with `starknet.calls` for internal call data.

---

## 8. DuneSQL Reference

DuneSQL is a **Trino fork** optimized for blockchain analytics.

### Key Types

| Type | Use |
|---|---|
| `VARBINARY` | Addresses, hashes (hex literals: `0x1234...`) |
| `UINT256` | Token amounts, gas values (256-bit unsigned) |
| `INT256` | Signed 256-bit integers |
| `BIGINT` | Default integer type |
| `DOUBLE` | Floating point |
| `VARCHAR` | Strings |
| `DATE` | Date (partition key for most tables) |
| `TIMESTAMP` | Block timestamps |

### Syntax Notes

- **No implicit casts** — use `CAST(x AS BIGINT)` explicitly
- **Double-quote reserved words** used as identifiers: `SELECT "from" FROM ...`
- **Parameterized queries**: `{{param_name::type}}` — e.g., `{{contract::varbinary}}`
- **String type is `VARCHAR`**, not `TEXT`

### Query Views (Query-a-Query)

Reference any saved public query as a subquery:

```sql
SELECT * FROM query_<query_id>
-- or with params:
SELECT * FROM "query_<query_id>(blockchain='starknet')"
```

---

## 9. Sample DuneSQL Queries for Starknet

### Latest Block

```sql
SELECT time, number, tx_count, hash
FROM starknet.blocks
ORDER BY number DESC
LIMIT 1;
```

### Transaction Volume by Day (Last 30 Days)

```sql
SELECT
  block_date,
  COUNT(*) AS tx_count,
  COUNT(*) FILTER (WHERE execution_status = 'SUCCEEDED') AS successful_txs,
  COUNT(*) FILTER (WHERE execution_status = 'REVERTED') AS reverted_txs
FROM starknet.transactions
WHERE block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

### Transaction by Hash

```sql
SELECT *
FROM starknet.transactions
WHERE transaction_hash = 0x0716bd0f37d806ceb45dff6d4d0620034c1d127df8a619e6febe9dfc034ef33e;
```

### Top Contracts by 30-Day Activity

```sql
SELECT
  contract_address,
  COUNT(*) AS invocation_count
FROM starknet.transactions
WHERE
  block_date >= current_date - INTERVAL '30' DAY
  AND type = 'INVOKE'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;
```

### ERC-20 Transfer Events for a Contract

```sql
-- keys[1] = from address, keys[2] = to address, data[1] = amount (low), data[2] = amount (high)
SELECT
  block_date,
  transaction_hash,
  bytearray_to_uint256(keys[2]) AS from_addr,
  bytearray_to_uint256(keys[3]) AS to_addr,
  bytearray_to_uint256(data[1]) AS amount_low
FROM starknet.events
WHERE
  from_address = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d  -- STRK token
  AND keys[1] = 0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9  -- Transfer selector
  AND block_date >= current_date - INTERVAL '7' DAY
ORDER BY block_date DESC
LIMIT 100;
```

### Gas Fees Paid Over Time

```sql
SELECT
  block_date,
  SUM(
    CASE
      WHEN actual_fee_unit = 'WEI' THEN CAST(actual_fee_amount AS DOUBLE) / 1e18
      WHEN actual_fee_unit = 'FRI' THEN CAST(actual_fee_amount AS DOUBLE) / 1e18
    END
  ) AS total_fees_eth_equivalent
FROM starknet.transactions
WHERE block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

### Event Count for a Protocol Contract

```sql
SELECT
  block_date,
  COUNT(*) AS event_count,
  COUNT(DISTINCT transaction_hash) AS unique_txs
FROM starknet.events
WHERE
  from_address = <protocol_contract_address>
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

---

## 10. Integration Patterns for chat-dune

### Pattern 1: Create Query → Execute → Poll

```typescript
// Pseudocode for lib/dune/client.ts
async function executeDuneQuery(sql: string): Promise<DuneResult> {
  const { query_id } = await mcp.createDuneQuery({ sql, title: 'chat-dune-temp' });
  const { execution_id } = await mcp.executeQueryById({ query_id, performance: 'medium' });

  // Poll until done or timeout
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await mcp.getExecutionResults({ execution_id });
    if (result.is_execution_finished) {
      if (result.state === 'QUERY_STATE_FAILED') throw new Error(result.error.message);
      return normalize(result, maxRows=500);
    }
    await sleep(500);
  }
  throw new Error('Dune query timeout after 30s');
}
```

### Pattern 2: Direct REST API (Alternative to MCP)

Dune also exposes a direct REST API (`api.dune.com/api/v1/query/{id}/execute`). This avoids MCP overhead if latency is a concern, but requires managing HTTP calls directly. **Recommended**: use MCP for the MVP since it integrates with Claude's tool_use natively.

### Pattern 3: Avoiding Truncation Surprises

Include `LIMIT 500` in generated SQL by default. Feed as part of Claude's system prompt instruction: "Always add LIMIT 500 to queries unless the user explicitly asks for a full result set."

### Pattern 4: Error Recovery

Common errors and recovery hints to feed back to Claude:

| Error | Recovery Hint |
|---|---|
| `syntax error at ...` | Fix SQL syntax at indicated position |
| `Column 'X' does not exist` | Use `searchTables` to verify column names |
| `Table not found` | Check `listBlockchains` and `searchTables` |
| Timeout (30s) | Suggest simplifying query or adding date filter |
| Rate limit (429) | Wait 2-3s and retry once; log the incident |

---

## 11. Critical Flags for Engineering

1. **No decoded Starknet tables** — all Starknet data analysis requires raw event parsing. The system prompt must include the Transfer event selector (`0x99cd8bde...`) and document Starknet's event layout (`keys[0]` = selector, `keys[1..]` = indexed params, `data` = non-indexed).

2. **Starknet uses Poseidon hashing** for event selectors, not Keccak256 like EVM. The selectors differ from Ethereum ERC-20/ERC-721 selectors.

3. **Execution is async** — the MCP tool call will block (poll internally) until results are ready. The 30-second timeout in our chat handler must account for Dune's polling time, not just the API call latency.

4. **STRK fees are in FRI** (v3 transactions), not WEI. For fee-related queries, check `actual_fee_unit` and handle both cases.

5. **`finality_status` distinction** — `ACCEPTED_ON_L2` means Starknet confirmed it; `ACCEPTED_ON_L1` means the proof has been submitted to Ethereum. For most analytics, L2 acceptance is sufficient.

6. **No Starknet entity labels in Dune** — workspace address mappings from chat-dune are the only source of human-readable names. Inject them into the system prompt and tool context.

---

## Sources

- [Dune MCP — Official Docs](https://docs.dune.com/api-reference/agents/mcp)
- [Rate Limits — Dune Docs](https://docs.dune.com/api-reference/overview/rate-limits)
- [Query Executions — Dune Docs](https://docs.dune.com/query-engine/query-executions)
- [Execute Query Endpoint](https://docs.dune.com/api-reference/executions/endpoint/execute-query)
- [Get Execution Result](https://docs.dune.com/api-reference/executions/endpoint/get-execution-result)
- [DuneSQL Query Engine Overview](https://docs.dune.com/query-engine/overview)
- [Starknet Data Overview](https://docs.dune.com/data-catalog/starknet/overview)
- [starknet.blocks schema](https://docs.dune.com/data-catalog/starknet/blocks)
- [starknet.transactions schema](https://docs.dune.com/data-catalog/starknet/transactions)
- [starknet.events schema](https://docs.dune.com/data-catalog/starknet/events)
- [starknet.calls schema](https://docs.dune.com/data-catalog/starknet/calls)
- [duneanalytics/spellbook — GitHub](https://github.com/duneanalytics/spellbook)
