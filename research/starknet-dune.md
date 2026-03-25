# Starknet Data Landscape on Dune

> **Task**: 2.2 — Research phase deliverable
> **Date**: 2026-03-24
> **Status**: Complete

---

## 1. Starknet on Dune: Overview

Dune indexes Starknet as a **first-class chain** with native data. However, coverage is **raw-data-only** — no decoded contract tables, no cross-chain spell abstractions, and no labels. All analytics requires direct parsing of raw event selectors, keys, and data arrays.

### Coverage Matrix

| Category | Starknet Support | Notes |
|---|---|---|
| Raw tables | **Yes** | 4 tables: blocks, transactions, events, calls |
| Decoded contract tables | **No** | No ABI-based decoding pipeline for Starknet |
| `dex.trades` | **No** | Not in the spellbook union (EVM chains only) |
| Token transfer spells | **No** | No `starknet.tokens.transfers` equivalent |
| Balances | **No** | — |
| NFT tables | **No** | — |
| Entity labels | **No** | chat-dune address mappings fill this gap |
| Prices (STRK) | **Partial** | Via `prices.usd` using Ethereum contract address |
| Bridge (L1 costs) | **Yes** | `rollup_economics_starknet.l1_data_fees` |
| L1 proof fees | **Yes** | `rollup_economics_starknet.l1_verification_fees` |

---

## 2. Raw Table Reference

### 2.1 `starknet.blocks`

Partition key: `date` (used in `WHERE date >= ...` for performance).

| Column | Type | Description |
|---|---|---|
| `date` | `DATE` | Partition date |
| `time` | `TIMESTAMP` | Block timestamp |
| `number` | `BIGINT` | Block number |
| `hash` | `VARBINARY` | Block hash |
| `tx_count` | `BIGINT` | Number of transactions |
| `starknet_version` | `VARCHAR` | Protocol version string |
| `sequencer_address` | `VARBINARY` | Sequencer address |
| `l1_da_mode` | `VARCHAR` | Data availability mode (BLOB or CALLDATA) |
| `l1_gas_price_in_fri` | `UINT256` | L1 gas price in FRI (Starknet native fee unit) |
| `l1_gas_price_in_wei` | `UINT256` | L1 gas price in WEI |
| `l2_gas_price_in_fri` | `UINT256` | L2 gas price in FRI |
| `l2_gas_price_in_wei` | `UINT256` | L2 gas price in WEI |
| `state_diff` | (complex) | State diff metadata |

### 2.2 `starknet.transactions`

Partition key: `block_date`.

| Column | Type | Description |
|---|---|---|
| `block_date` | `DATE` | Partition date |
| `block_time` | `TIMESTAMP` | Block timestamp |
| `block_number` | `BIGINT` | Block number |
| `transaction_hash` | `VARBINARY` | Transaction hash (unique identifier) |
| `type` | `VARCHAR` | `INVOKE`, `DECLARE`, `DEPLOY_ACCOUNT`, `DEPLOY`, `L1_HANDLER` |
| `version` | `VARCHAR` | Transaction version (v0, v1, v2, v3) |
| `sender_address` | `VARBINARY` | Sender account contract address |
| `contract_address` | `VARBINARY` | Target contract address (for INVOKE) |
| `calldata` | `ARRAY(VARBINARY)` | Raw calldata array |
| `actual_fee_amount` | `UINT256` | Actual fee paid |
| `actual_fee_unit` | `VARCHAR` | `WEI` (v0–v2) or `FRI` (v3) |
| `execution_status` | `VARCHAR` | `SUCCEEDED` or `REVERTED` |
| `finality_status` | `VARCHAR` | `ACCEPTED_ON_L2` or `ACCEPTED_ON_L1` |
| `revert_reason` | `VARCHAR` | Revert reason string (if reverted) |
| `nonce` | `BIGINT` | Transaction nonce |
| `max_fee` | `UINT256` | Max fee cap |
| `tip` | `UINT256` | Priority fee tip (v3 only) |
| `resource_bounds` | (complex) | Resource bound specs (v3 only) |
| `pedersen` | `BIGINT` | Pedersen builtin count |
| `poseidon` | `BIGINT` | Poseidon builtin count |
| `ecdsa` | `BIGINT` | ECDSA builtin count |
| `keccak` | `BIGINT` | Keccak builtin count |
| `bitwise` | `BIGINT` | Bitwise builtin count |
| `range_check` | `BIGINT` | Range check builtin count |
| `ec_op` | `BIGINT` | EC op builtin count |
| `memory_holes` | `BIGINT` | Memory holes count |
| `steps` | `BIGINT` | Cairo VM step count |

**Key notes**:
- `actual_fee_unit` differs by transaction version: v0/v1/v2 = `WEI`, v3 = `FRI`. Always handle both in fee queries.
- `finality_status = 'ACCEPTED_ON_L2'` is sufficient for most analytics (L1 acceptance lags by hours).
- `calldata` is an `ARRAY(VARBINARY)` — decoding requires knowing the ABI of the target contract.

### 2.3 `starknet.events`

Partition key: `block_date`.

| Column | Type | Description |
|---|---|---|
| `block_date` | `DATE` | Partition date |
| `block_time` | `TIMESTAMP` | Block timestamp |
| `block_number` | `BIGINT` | Block number |
| `block_status` | `VARCHAR` | Block finality (`ACCEPTED_ON_L2`, `ACCEPTED_ON_L1`) |
| `transaction_hash` | `VARBINARY` | Emitting transaction hash |
| `event_index` | `BIGINT` | Position within the transaction's event list |
| `from_address` | `VARBINARY` | Contract that emitted the event |
| `keys` | `ARRAY(VARBINARY)` | Event keys: `keys[1]` = selector (Poseidon hash), `keys[2..]` = indexed params |
| `data` | `ARRAY(VARBINARY)` | Non-indexed event parameters |
| `class_hash` | `VARBINARY` | Class hash of the emitting contract |

**Critical layout detail**:
- `keys[1]` — event selector (Poseidon hash of the Cairo event name)
- `keys[2]`, `keys[3]`, ... — indexed parameters (varies by event)
- `data[1]`, `data[2]`, ... — non-indexed parameters (varies by event)

> Array indexing in DuneSQL is **1-based**. `keys[1]` is the first element (the selector).

> **Always add `AND cardinality(keys) >= N`** before accessing `keys[N]` — some events have fewer keys than the standard layout, and accessing out-of-bounds indices throws a runtime error.

**Helper functions for event data**:
```sql
-- Convert VARBINARY to a readable hex string
CAST(keys[1] AS VARCHAR)

-- Convert VARBINARY to uint256 (for amounts, addresses)
bytearray_to_uint256(data[1])

-- Convert address field to lowercase hex
lower(CAST(from_address AS VARCHAR))
```

> **Note**: `bytearray_to_varchar` does not exist in DuneSQL — use `CAST(... AS VARCHAR)` instead.

### 2.4 `starknet.calls`

Partition key: `block_date`.

| Column | Type | Description |
|---|---|---|
| `block_date` | `DATE` | Partition date |
| `block_time` | `TIMESTAMP` | Block timestamp |
| `block_number` | `BIGINT` | Block number |
| `transaction_hash` | `VARBINARY` | Parent transaction hash |
| `transaction_index` | `BIGINT` | Position in block |
| `call_type` | `VARCHAR` | `CALL`, `DELEGATE`, `LIBRARY_CALL` |
| `entry_point_selector` | `VARBINARY` | Function selector |
| `contract_address` | `VARBINARY` | Target contract |
| `caller_address` | `VARBINARY` | Calling contract/account |
| `calldata` | `ARRAY(VARBINARY)` | Input calldata |
| `result` | `VARBINARY` | Return value |
| `revert_reason` | `VARCHAR` | Revert reason (if failed) |
| `callstack_index` | `BIGINT` | Depth in the call stack (0 = top level) |
| `events` | `ARRAY(ROW)` | Events emitted during this call |
| `messages` | `ARRAY(ROW)` | L2→L1 messages sent during this call |

**Use case**: For analyzing internal contract interactions (e.g., calls within a DEX swap that touch multiple contracts).

---

## 3. Spellbook Tables (Starknet-Adjacent)

Two additional tables exist in the Dune spellbook. They are Starknet-specific but track **Ethereum L1 costs** rather than Starknet L2 activity:

### `rollup_economics_starknet.l1_data_fees`

Tracks Starknet's data availability costs on Ethereum L1 (calldata/blob gas paid to the state update contract).

```sql
SELECT * FROM rollup_economics_starknet.l1_data_fees
WHERE block_time >= current_date - INTERVAL '30' DAY
ORDER BY block_time DESC;
```

### `rollup_economics_starknet.l1_verification_fees`

Tracks ZK proof verification fees paid by SHARP (the Starknet prover) on Ethereum. Note: SHARP is shared across Starknet, Sorare, ImmutableX, and other StarkEx chains.

---

## 4. Prices for Starknet Tokens

STRK and other Starknet tokens can be price-queried via `prices.usd`, but using their **Ethereum** token addresses:

| Token | `prices.usd` query |
|---|---|
| STRK | `blockchain = 'ethereum' AND contract_address = 0xca14007eff0db1f8135f4c25b34de49ab0d42766` |
| ETH | `symbol = 'ETH'` (no chain filter needed) |
| USDC | `symbol = 'USDC' AND blockchain = 'ethereum'` |

```sql
-- Example: STRK price in USD over last 30 days
SELECT
  minute,
  price
FROM prices.usd
WHERE
  blockchain = 'ethereum'
  AND contract_address = 0xca14007eff0db1f8135f4c25b34de49ab0d42766
  AND minute >= current_date - INTERVAL '30' DAY
ORDER BY minute DESC;
```

There is **no `starknet/` prices subdirectory** in the spellbook — all Starknet token prices must reference Ethereum-side contract addresses.

---

## 5. Known Protocol Contract Addresses

### 5.1 ERC-20 Token Contracts (Starknet L2)

From the official StarkWare/Starknet Foundation address registry (`starkware-libs/starknet-addresses`).

| Token | Symbol | L2 Token Address |
|---|---|---|
| Starknet Token | STRK | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| Ether | ETH | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` |
| USD Coin | USDC | `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8` |
| Tether USD | USDT | `0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8` |
| Wrapped BTC | WBTC | `0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac` |
| Dai Stablecoin | DAI | `0x05574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad` |
| Wrapped stETH | wstETH | `0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2` |
| Ekubo Protocol | EKUBO | `0x075afe6402ad5a5c20dd25e10ec3b3986acaa647b77e4ae24b0cbc9a54a27a87` |

### 5.2 StarkGate Bridge Contracts

L2 bridge contracts on Starknet (per-token). Source: `starkware-libs/starknet-addresses`.

| Token | L2 Bridge Address (Starknet) | L1 Bridge Address (Ethereum) |
|---|---|---|
| ETH | `0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82` | `0xae0Ee0A63A2cE6BaeEFFE56e7714FB4EFE48D419` |
| STRK | `0x0594c1582459ea03f77deaf9eb7e3917d6994a03c13405ba42867f83d85f085d` | `0xcE5485Cfb26914C5dcE00B9BAF0580364daFC7a4` |
| USDC | `0x05cd48fccbfd8aa2773fe22c217e808319ffcc1c5a6a463f7d8fa2da48218196` | `0xF6080D9fbEEbcd44D89aFfBFd42F098cbFf92816` |
| USDT | `0x074761a8d48ce002963002becc6d9c3dd8a2a05b1075d55e5967f42296f16bd0` | `0xbb3400F107804DFB482565FF1Ec8D8aE66747605` |
| WBTC | `0x07aeec4870975311a7396069033796b61cd66ed49d22a786cba12a8d76717302` | `0x283751A21eafBFcD52297820D27C1f1963D9b5b4` |

### 5.3 DEX Protocols

**JediSwap (AMM)**. Source: JediSwap official frontend constants.

| Contract | Address |
|---|---|
| V1 Router | `0x041fd22b238fa21cfcf5dd45a8548974d8263b3a531a60388411c5e230f97023` |
| V1 Factory | `0x00dad44c139a476c7a17fc8141e6db680e9abc9f56fe249a105094c44382c2fd` |
| V2 Factory (CLAMM) | `0x01aa950c9b974294787de8df8880ecf668840a6ab8fa8290bf2952212b375148` |
| V2 SwapRouter | `0x0359550b990167afd6635fa574f3bdadd83cb51850e1d00061fe693158c23f80` |
| V2 PositionManager | `0x0469b656239972a2501f2f1cd71bf4e844d64b7cae6773aa84c702327c476e5b` |

**AVNU (DEX Aggregator)**. Source: AVNU official docs + contract repo.

| Contract | Address |
|---|---|
| Exchange Router | `0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f` |

**Ekubo (Concentrated Liquidity DEX)**. Source: `EkuboProtocol/starknet-contracts` GitHub releases.

| Contract | v3.3.8 (stable) | v4.0.1 (latest) |
|---|---|---|
| Core | `0x02a6f52c3635211b907467b53e3a712be41f0115d03f9d5903d448a1cd4f6f5c` | `0x0577604a2611c851e9cfc4da2ba7f7fc1d44a9327cc734d68b2b271340a6551c` |
| Router | `0x07419444883509420971cabcbaaed2ba8683d21ec65b57c6834f7cb2ce29243c` | `0x05c499500ebabf58edcc7bf65a25805329548cdd63c26ea7133f55185f0ffa6c` |
| Positions NFT | `0x04fd8d4e2c73ff8ad0f43c73fe3a26a9e98060539876f0393a41be1bd6021b5e` | `0x00c12f7c0a0bf73e3675345a8d28d26c83db3b13605f2aa33cba8344a0f582b5` |
| TWAMM | `0x055f9ac6f3cfd1a716aadc27b5ec9e23d9d656515d5cc20875ad4887108e1504` | `0x0131e8a1b84559246f3743584740446c28f7fd885d5859d63d2883d1002d80ba` |
| Limit Orders | `0x04c4b9db96d22acc724546a6f2d8b432e13024000c42d4bef3b9439b5c50d3fe` | `0x073073a6c4b631f49e199e963259398baf150db99bfc15846f43163ec09381c4` |

### 5.4 Lending Protocols

**zkLend**. Source: DefiLlama TVL adapter.

| Contract | Address |
|---|---|
| Market (V1) | `0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05` |

> Note: zkLend V2 is in development following a 2025 security incident. V2 mainnet addresses not yet public.

**Nostra**. Source: DefiLlama adapter.

| Contract | Address |
|---|---|
| Pools Factory | `0x02a93ef8c7679a5f9b1fcf7286a6e1cadf2e9192be4bcb5cb2d1b39062697527` |

> Note: Nostra uses a pool-based architecture with individual token market contracts. No single "main contract" — the factory above is the top-level registry.

**Vesu**. Source: Vesu official docs (`docs.vesu.xyz/developers/contract-addresses`).

| Contract | Address |
|---|---|
| V1 Singleton | `0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160` |
| V2 PoolFactory | `0x03760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0` |
| V2 Oracle | `0x00fe4bfb1b353ba51eb34dff963017f94af5a5cf8bdf3dfc191c504657f3c05` |

---

## 6. Verified Event Selectors (Empirically Confirmed on Dune)

These selectors were confirmed by querying `starknet.events` live on Dune and inspecting `CAST(keys[1] AS VARCHAR)` outputs.

> **Important**: Selectors are stored as full 32-byte VARBINARY values in Dune. Always use the zero-padded 64-char hex form (e.g., `0x0099cd8b...`), not the shortened form (`0x99cd8b...`). They will not match if truncated.

| Event | Selector (DuneSQL hex literal) | Layout | Source |
|---|---|---|---|
| ERC-20 `Transfer` | `0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9` | `keys[1]`=selector; `data[1]`=from, `data[2]`=to, `data[3]`=amount_low, `data[4]`=amount_high | Confirmed live on STRK token (~225K events/day) |
| ERC-20 `Approval` | `0x0134692b230b9e1ffa39098904722134159652b09c5bc41d88d6698779d228ff` | TBD — selector confirmed, data layout unverified | Confirmed via STRK token events |
| StarkGate ETH bridge — unknown (likely `deposit_handled`) | `0x0374396cb322ab5ffd35ddb8627514609289d22c07d039ead5327782f61bb833` | TBD | Confirmed live on ETH L2 bridge (~10/day) |
| StarkGate ETH bridge — unknown (likely `initiate_withdraw`) | `0x0282f521c69b2bc696552b9e141009d3c84f2df75e2e7b7716644d31e60f23b1` | TBD | Confirmed live on ETH L2 bridge (~10/day) |
| StarkGate ETH bridge — unknown (rare/admin) | `0x0194fc63c49b0f07c8e7a78476844837255213824bd6cb81e0ccfb949921aad1` | TBD | Confirmed live on ETH L2 bridge (~1/day) |

> **Key finding**: Cairo ERC-20 Transfer events (STRK and likely most tokens) store `from`/`to`/`value` in `data[]`, not `keys[]`. Only the selector is in `keys[1]`. This differs from EVM Dune tables where indexed params appear in separate columns.

> **Key finding (GROUP BY)**: When grouping by a `CAST(... AS VARCHAR)` expression, repeat the full expression in the `GROUP BY` clause — DuneSQL does not allow referencing column aliases from `SELECT` in `GROUP BY`.

More selectors to be catalogued in task 2.4 (Starknet Event Selector Registry).

---

## 7. Gap Analysis: Dune vs. RPC

This section directly informs when the chat engine should fall back to Starknet RPC.

### 7.1 Use Dune (Primary Data Source)

| Use Case | Table(s) | Notes |
|---|---|---|
| Transaction volume by day | `starknet.transactions` | Partition on `block_date` |
| Active addresses over time | `starknet.transactions` | Aggregate `sender_address` |
| Gas fee trends | `starknet.transactions` | Handle `WEI` vs `FRI` unit split |
| Token transfers (ERC-20) | `starknet.events` | Filter by `keys[1]` = Transfer selector |
| Protocol activity | `starknet.events`, `starknet.calls` | Filter by `from_address` = contract |
| DEX swap volume | `starknet.events` | Filter by Swap event selector for known DEX |
| Block statistics | `starknet.blocks` | |
| Bridge inflows/outflows | `starknet.events` | Filter by StarkGate contract + Deposit/Withdraw selectors |
| STRK price conversion | `prices.usd` (Ethereum) | Use ETH-side STRK contract address |
| L1 proof costs | `rollup_economics_starknet.*` | Rollup-level cost attribution |
| Historical queries (>1h ago) | Any raw table | Dune excels at historical analytics |

### 7.2 Use Starknet RPC (When Dune is Insufficient)

| Use Case | RPC Method | Reason |
|---|---|---|
| Current block / latest state | `starknet_blockNumber`, `starknet_getBlockWithTxHashes` | Dune indexing lags by minutes to hours |
| Pending / unconfirmed txs | `starknet_getTransactionByHash` (with PENDING block tag) | Dune only indexes finalized blocks |
| Real-time balance checks | `starknet_call` → ERC-20 `balanceOf` | Point-in-time contract state |
| Contract storage reads | `starknet_getStorageAt` | Live contract state, not available in Dune |
| Specific tx status check | `starknet_getTransactionReceipt` | For just-submitted transactions |
| Contract ABI / class hash | `starknet_getClassAt` | Contract metadata |
| L1→L2 message status | `starknet_getMessageStatus` | Bridge status not indexed by Dune |

### 7.3 Neither Dune Nor RPC (Requires Off-chain Sources)

| Use Case | Alternative |
|---|---|
| Human-readable entity names | chat-dune address mappings (workspace CSV) |
| Protocol TVL (formatted) | DefiLlama API |
| Token market cap / FDV | CoinGecko / CoinMarketCap API |
| Protocol governance / docs | Protocol-specific websites |

---

## 8. Sample DuneSQL Queries

### 8.1 ERC-20 Transfer Volume for a Token

> **Empirically verified layout for STRK and most Cairo ERC-20 tokens**: `from`, `to`, and `value` are in `data[]`, not `keys[]`. Only the selector is in `keys[1]`. Do NOT use `keys[2]`/`keys[3]` for ERC-20 Transfer parameters — they don't exist and will throw a runtime error.
>
> Confirmed layout:
> - `keys[1]` = Transfer selector
> - `data[1]` = from address
> - `data[2]` = to address
> - `data[3]` = amount low (u256 low 128 bits)
> - `data[4]` = amount high (u256 high 128 bits)

```sql
-- ERC-20 Transfer events for STRK token (last 7 days)
-- Verified: from/to/value are in data[], not keys[]
SELECT
  block_date,
  COUNT(*) AS transfer_count,
  COUNT(DISTINCT data[1]) AS unique_senders
FROM starknet.events
WHERE
  from_address = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d  -- STRK token
  AND keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9  -- Transfer selector
  AND cardinality(data) >= 2
  AND block_date >= current_date - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

### 8.2 Daily Transaction Volume and Success Rate

```sql
SELECT
  block_date,
  COUNT(*) AS total_txs,
  COUNT(*) FILTER (WHERE execution_status = 'SUCCEEDED') AS succeeded,
  COUNT(*) FILTER (WHERE execution_status = 'REVERTED') AS reverted,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE execution_status = 'SUCCEEDED') / COUNT(*),
    2
  ) AS success_rate_pct
FROM starknet.transactions
WHERE block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

### 8.3 Top Protocols by Event Count

```sql
SELECT
  from_address,
  COUNT(*) AS event_count,
  COUNT(DISTINCT transaction_hash) AS unique_txs
FROM starknet.events
WHERE block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;
```

### 8.4 Protocol Swap Activity (AVNU Aggregator)

```sql
-- All events emitted by the AVNU exchange contract
SELECT
  block_date,
  CAST(keys[1] AS VARCHAR) AS event_selector,
  COUNT(*) AS event_count
FROM starknet.events
WHERE
  from_address = 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f  -- AVNU Exchange
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1, 2
ORDER BY 3 DESC;
```

### 8.5 StarkGate Bridge Events (ETH bridge)

```sql
-- Events from the ETH L2 bridge contract, broken out by selector
SELECT
  block_date,
  COUNT(*) AS bridge_events,
  CAST(keys[1] AS VARCHAR) AS event_selector
FROM starknet.events
WHERE
  from_address = 0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82  -- ETH L2 bridge
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY block_date, CAST(keys[1] AS VARCHAR)
ORDER BY block_date DESC, bridge_events DESC;
```

**Empirically discovered selectors** (confirmed live, ~30 day window):

| Selector | Approx. frequency | Name (TBD in task 2.4) |
|---|---|---|
| `0x0374396cb322ab5ffd35ddb8627514609289d22c07d039ead5327782f61bb833` | ~10/day | Unknown — likely `deposit_handled` |
| `0x0282f521c69b2bc696552b9e141009d3c84f2df75e2e7b7716644d31e60f23b1` | ~10/day | Unknown — likely `initiate_withdraw` |
| `0x0194fc63c49b0f07c8e7a78476844837255213824bd6cb81e0ccfb949921aad1` | ~1/day or less | Unknown — rare, possibly admin/governance |

Event names to be resolved against the StarkGate ABI in task 2.4.

### 8.6 Gas Fees Paid Over Time (Multi-Unit Aware)

```sql
SELECT
  block_date,
  SUM(
    CASE
      WHEN actual_fee_unit = 'WEI' THEN CAST(actual_fee_amount AS DOUBLE) / 1e18
      WHEN actual_fee_unit = 'FRI' THEN CAST(actual_fee_amount AS DOUBLE) / 1e18
    END
  ) AS total_fees_normalized,
  COUNT(*) FILTER (WHERE actual_fee_unit = 'FRI') AS v3_tx_count,
  COUNT(*) FILTER (WHERE actual_fee_unit = 'WEI') AS legacy_tx_count
FROM starknet.transactions
WHERE block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

### 8.7 Unique Active Wallets by Day

```sql
SELECT
  block_date,
  COUNT(DISTINCT sender_address) AS daily_active_wallets
FROM starknet.transactions
WHERE
  block_date >= current_date - INTERVAL '30' DAY
  AND execution_status = 'SUCCEEDED'
  AND type = 'INVOKE'
GROUP BY 1
ORDER BY 1 DESC;
```

---

## 9. System Prompt Engineering Implications

### What Must Be Injected into the System Prompt

Based on the raw-data-only nature of Starknet on Dune, the system prompt must include:

1. **Table namespace**: Only `starknet.blocks`, `starknet.transactions`, `starknet.events`, `starknet.calls` are available.

2. **Event selector pattern**: All Starknet event filtering requires `WHERE keys[1] = <selector>`. The selector is the Poseidon hash of the Cairo event name.

3. **Array indexing**: DuneSQL arrays are **1-indexed**. `keys[1]` is the first element (the event selector). `keys[2]` is the first indexed parameter.

4. **Fee unit handling**: Always handle both `WEI` (v0–v2 txs) and `FRI` (v3 txs) in fee queries.

5. **No decoded tables**: Instruct the LLM: "There are no decoded Starknet contract tables on Dune. Do not use `starknet_erc20_evt_transfer` or similar — they do not exist."

6. **No `dex.trades` for Starknet**: "The `dex.trades` abstraction only covers EVM chains. For Starknet DEX activity, query `starknet.events` directly with the Swap event selector."

7. **Prices via Ethereum**: "For USD price conversion of STRK or other Starknet tokens, use `prices.usd` with `blockchain = 'ethereum'` and the Ethereum-side token contract address."

8. **Address format**: Starknet addresses are 32-byte hex values stored as `VARBINARY`. Use hex literals (e.g., `0x04718f5a...`) directly in WHERE clauses.

### Recommended Fallback Decision Tree for the LLM

```
User question involves:
  → Historical on-chain data (>1h ago)       → USE DUNE (starknet.* tables)
  → Current block / latest state             → USE RPC (starknet_blockNumber)
  → Real-time balance check                  → USE RPC (starknet_call → balanceOf)
  → Pending transaction status               → USE RPC (starknet_getTransactionReceipt)
  → Human-readable entity names              → USE address_mappings (workspace data)
  → Protocol TVL / market cap                → Inform user: use DefiLlama / CoinGecko
```

---

## 10. Address Format Reference

- Starknet addresses: `0x` prefix + up to 63 hex characters (32 bytes, zero-padded to full length)
- Leading zeros may be omitted in user-facing representations but are canonical in Dune `VARBINARY` values
- Example: STRK token = `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` (63 chars after `0x`)
- In DuneSQL: write hex literals directly — `WHERE from_address = 0x04718f5a...`
- For display: use `CAST(addr)` to get a hex string

---

## Sources

- [Dune Data Catalog — Starknet Overview](https://docs.dune.com/data-catalog/starknet/overview)
- [starknet.blocks schema](https://docs.dune.com/data-catalog/starknet/blocks)
- [starknet.transactions schema](https://docs.dune.com/data-catalog/starknet/transactions)
- [starknet.events schema](https://docs.dune.com/data-catalog/starknet/events)
- [starknet.calls schema](https://docs.dune.com/data-catalog/starknet/calls)
- [duneanalytics/spellbook — GitHub](https://github.com/duneanalytics/spellbook)
- [starkware-libs/starknet-addresses — GitHub](https://github.com/starkware-libs/starknet-addresses)
- [JediSwap frontend constants](https://github.com/jediswaplabs/jediswap-interface)
- [AVNU contract docs](https://docs.avnu.fi/resources/contracts)
- [EkuboProtocol/starknet-contracts — GitHub Releases](https://github.com/EkuboProtocol/starknet-contracts/releases)
- [Vesu Developer Docs](https://docs.vesu.xyz/developers/contract-addresses)
- [DefiLlama Adapters — zkLend, Nostra, Vesu](https://github.com/DefiLlama/DefiLlama-Adapters)
- [Dune Prices Overview](https://docs.dune.com/data-catalog/curated/prices/overview)
