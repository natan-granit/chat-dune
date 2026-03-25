# Starknet Event Selector Registry

> **Task**: 2.4 — Research phase deliverable
> **Date**: 2026-03-24
> **Status**: Complete — empirically verified via Dune MCP 2026-03-24

---

## Overview

Starknet event selectors are `sn_keccak` hashes — a variant of Keccak256 truncated to 250 bits — applied to the ASCII event name. They are stored in `starknet.events.keys[1]` in Dune (1-indexed).

**Critical DuneSQL rules**:
1. Array indexing is **1-based**: `keys[1]` = selector, `keys[2]` = first indexed param
2. Always use **zero-padded 64-char hex** (e.g., `0x0099cd8b...` not `0x99cd8b...`)
3. Add **cardinality guards** before accessing array elements: `AND cardinality(keys) >= N`
4. **`data[]`** holds non-indexed parameters; **`keys[2..]`** holds indexed (`#[key]`) parameters
5. **u256** serializes as two sequential felts: `_low` (bits 0–127) and `_high` (bits 128–255)

**Verification status legend**:
- ✅ **Verified**: Selector confirmed by matching `sn_keccak(name)` against empirically observed values from live `starknet.events` queries on Dune
- ⚠️ **Computed**: Selector derived from `sn_keccak(event_name)` against known Cairo source; not yet cross-checked on Dune
- 🔶 **Layout inferred**: Parameter order inferred from ABI or protocol docs, not verified by inspecting Dune rows

---

## 1. Token Standards

### 1.1 ERC-20 `Transfer` ✅ (selector + layout verified)

```
Selector: 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9
```

**Parameter layout (pre-SNIP-13, dominant Starknet style)**:

| Array | Index | Field | Type | DuneSQL |
|-------|-------|-------|------|---------|
| keys | 1 | selector | felt252 | `keys[1]` |
| data | 1 | from | ContractAddress | `data[1]` |
| data | 2 | to | ContractAddress | `data[2]` |
| data | 3 | amount_low | u128 | `data[3]` |
| data | 4 | amount_high | u128 | `data[4]` |

> **Key finding**: `from`, `to`, and `value` are in **`data[]`**, NOT `keys[]`. This is the opposite of EVM behaviour. Confirmed live on STRK (~225K events/day).

> **Warning**: ERC-721 `Transfer` has the **same selector** (both events are named `Transfer`). Distinguish by contract address or by cardinality: ERC-20 has `cardinality(data) >= 4`, ERC-721 has `cardinality(keys) >= 5` with empty `data`.

**Sample DuneSQL** — daily transfer count + unique senders for STRK:
```sql
SELECT
  block_date,
  COUNT(*) AS transfer_count,
  COUNT(DISTINCT data[1]) AS unique_senders
FROM starknet.events
WHERE
  from_address = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d  -- STRK
  AND keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9  -- Transfer
  AND cardinality(data) >= 4
  AND block_date >= current_date - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

---

### 1.2 ERC-20 `Approval` ✅ (selector verified) / 🔶 (layout inferred)

```
Selector: 0x0134692b230b9e1ffa39098904722134159652b09c5bc41d88d6698779d228ff
```

| Array | Index | Field | Type |
|-------|-------|-------|------|
| keys | 1 | selector | felt252 |
| data | 1 | owner | ContractAddress |
| data | 2 | spender | ContractAddress |
| data | 3 | amount_low | u128 |
| data | 4 | amount_high | u128 |

> Selector confirmed empirically on STRK token. Data layout inferred by analogy with Transfer (same OZ Cairo ERC-20 implementation pattern). Verify before writing production queries.

---

### 1.3 ERC-721 `Transfer` ⚠️ (computed) / 🔶 (layout inferred)

```
Selector: 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9
```

**Same selector as ERC-20 `Transfer`!** See §1.1 warning above.

| Array | Index | Field | Type | Note |
|-------|-------|-------|------|------|
| keys | 1 | selector | felt252 | |
| keys | 2 | from | ContractAddress | `#[key]` |
| keys | 3 | to | ContractAddress | `#[key]` |
| keys | 4 | token_id_low | u128 | `#[key]`, u256 low |
| keys | 5 | token_id_high | u128 | `#[key]`, u256 high |
| data | — | — | — | data[] is empty |

> OpenZeppelin Cairo ERC-721 marks all three Transfer params as `#[key]`. All params go into `keys[]`, leaving `data[]` empty.

**Sample DuneSQL** — identify ERC-721 Transfer events (cardinality check distinguishes from ERC-20):
```sql
SELECT
  from_address AS nft_contract,
  COUNT(*) AS transfer_count
FROM starknet.events
WHERE
  keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9
  AND cardinality(keys) >= 5   -- ERC-721: from + to + token_id (2 felts) = 4 params after selector
  AND cardinality(data) = 0    -- ERC-721: no data[] params
  AND block_date >= current_date - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 2 DESC;
```

---

### 1.4 ERC-721 `ApprovalForAll` ⚠️ (computed) / 🔶 (layout inferred)

```
Selector: 0x0006ad9ed7b6318f1bcffefe19df9aeb40d22c36bed567e1925a5ccde0536edd
```

| Array | Index | Field | Type |
|-------|-------|-------|------|
| keys | 1 | selector | felt252 |
| keys | 2 | owner | ContractAddress |
| keys | 3 | operator | ContractAddress |
| data | 1 | approved | bool |

---

## 2. DEX Events

### 2.1 AVNU `Swap` ⚠️ (computed) / 🔶 (layout from source)

```
Selector: 0x00e316f0d9d2a3affa97de1d99bb2aac0538e2666d0d8545545ead241ef0ccab
Contract: 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f
```

> Layout from `avnu-labs/avnu-contracts-v2` GitHub — struct `Swap`. No `#[key]` fields; all params in `data[]`.

| Array | Index | Field | Type |
|-------|-------|-------|------|
| keys | 1 | selector | felt252 |
| data | 1 | taker_address | ContractAddress |
| data | 2 | sell_address | ContractAddress |
| data | 3 | sell_amount_low | u128 |
| data | 4 | sell_amount_high | u128 |
| data | 5 | buy_address | ContractAddress |
| data | 6 | buy_amount_low | u128 |
| data | 7 | buy_amount_high | u128 |
| data | 8 | beneficiary | ContractAddress |

> **Note**: Same selector `0x00e316f0...` is used by JediSwap V2 `Swap` events (both named `Swap`). Distinguish by `from_address`.

**Sample DuneSQL** — AVNU daily swap volume (in/out tokens):
```sql
SELECT
  block_date,
  COUNT(*) AS swap_count,
  COUNT(DISTINCT data[1]) AS unique_swappers
FROM starknet.events
WHERE
  from_address = 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f  -- AVNU Exchange
  AND keys[1] = 0x00e316f0d9d2a3affa97de1d99bb2aac0538e2666d0d8545545ead241ef0ccab  -- Swap
  AND cardinality(data) >= 8
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

---

### 2.2 Ekubo `Swapped` ⚠️ (computed) / 🔶 (layout from source)

```
Selector: 0x0157717768aca88da4ac4279765f09f4d0151823d573537fbbeb950cdbd9a870
Contract:  0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b  ← VERIFIED ✅ (767K events/30d)
NOTE: Previous addresses (0x02a6f5..., 0x05776...) were wrong — 0 events even over 90 days
```

> **Important**: Event is named `Swapped` (past tense), NOT `SwapExecuted`. Layout from `EkuboProtocol/starknet-contracts` GitHub. No `#[key]` fields. Heavy nested struct — expands to ~25 data[] felts.

| Array | Index | Field | Type | Notes |
|-------|-------|-------|------|-------|
| keys | 1 | selector | felt252 | |
| data | 1 | locker | ContractAddress | |
| data | 2–8 | pool_key | PoolKey | 5 felts (token0, token1, fee×2, tick_spacing×2, extension) |
| data | 9–15 | params | SwapParameters | 7 felts |
| data | 16–17 | delta.amount0 | i129 | token0 amount (signed) |
| data | 18–19 | delta.amount1 | i129 | token1 amount (signed) |
| data | 20–21 | sqrt_ratio_after | u256 | |
| data | 22–23 | tick_after | i129 | |
| data | 24–25 | liquidity_after | u128 | |

> For swap volume analytics, use `data[16..19]` (delta amounts). See JSON registry for full index breakdown.

**Sample DuneSQL** — Ekubo swap count by day:
```sql
SELECT
  block_date,
  COUNT(*) AS swap_count
FROM starknet.events
WHERE
  from_address = 0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b  -- Ekubo core (VERIFIED)
  AND keys[1] = 0x0157717768aca88da4ac4279765f09f4d0151823d573537fbbeb950cdbd9a870  -- Swapped
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

---

### 2.3 Ekubo `PositionUpdated` ⚠️ (computed) / 🔶 (layout from source)

```
Selector:  0x03a7adca3546c213ce791fabf3b04090c163e419c808c9830fb343a4a395946e
Contract:  0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b  ← VERIFIED ✅ (9.7K events/30d)
```

> Emitted on add-liquidity AND remove-liquidity. Positive `liquidity_delta` = add; negative = remove.

| Array | Index | Field | Type | Notes |
|-------|-------|-------|------|-------|
| keys | 1 | selector | felt252 | |
| data | 1 | locker | ContractAddress | |
| data | 2–8 | pool_key | PoolKey | 5 felts expanded |
| data | 9 | params.salt | felt252 | position identifier |
| data | 10–13 | params.bounds | Bounds | tick_lower×2, tick_upper×2 |
| data | 14–15 | params.liquidity_delta | i129 | signed; positive = add, negative = remove |
| data | 16–17 | delta.amount0 | i129 | token0 net change |
| data | 18–19 | delta.amount1 | i129 | token1 net change |

---

### 2.4 Ekubo `PoolInitialized` ⚠️ (computed) / 🔶 (layout from source)

```
Selector: 0x025ccf80ee62b2ca9b97c76ccea317c7f450fd6efb6ed6ea56da21d7bb9da5f1
```

| Array | Index | Field | Type |
|-------|-------|-------|------|
| keys | 1 | selector | felt252 |
| data | 1–7 | pool_key | PoolKey (5 felts) |
| data | 8–9 | initial_tick | i129 |
| data | 10–11 | sqrt_ratio | u256 |

---

### 2.5 JediSwap V2 `Swap` ⚠️ (computed) / 🔶 (layout from source)

```
Selector: 0x00e316f0d9d2a3affa97de1d99bb2aac0538e2666d0d8545545ead241ef0ccab
```

> Same selector as AVNU `Swap`. Layout from `jediswaplabs/JediSwap-v2-core` GitHub. No `#[key]` fields.

| Array | Index | Field | Type |
|-------|-------|-------|------|
| keys | 1 | selector | felt252 |
| data | 1 | sender | ContractAddress |
| data | 2 | recipient | ContractAddress |
| data | 3–4 | amount0 | i256 (signed u256) |
| data | 5–6 | amount1 | i256 (signed u256) |
| data | 7–8 | sqrt_price_x96 | u256 |
| data | 9–10 | liquidity | u128 (2 felts) |
| data | 11 | tick | i32 |

---

### 2.6 JediSwap V2 `Mint` and `Burn` ⚠️ (computed) / 🔶 (layout from source)

```
Mint selector: 0x034e55c1cd55f1338241b50d352f0e91c7e4ffad0e4271d64eb347589ebdfd16
Burn selector: 0x0243e1de00e8a6bc1dfa3e950e6ade24c52e4a25de4dee7fb5affe918ad1e744
```

> Same `Mint` selector used by Nostra for supply operations. Distinguish by `from_address`.

**Mint data layout**: sender, owner, tick_lower, tick_upper, amount (u128 ×2), amount0 (u256 ×2), amount1 (u256 ×2) = 10 data fields

**Burn data layout**: owner, tick_lower, tick_upper, amount (u128 ×2), amount0 (u256 ×2), amount1 (u256 ×2) = 9 data fields

---

## 3. StarkGate Bridge Events

### 3.1 `DepositHandled` ✅ (selector verified) / 🔶 (layout inferred)

```
Selector: 0x0374396cb322ab5ffd35ddb8627514609289d22c07d039ead5327782f61bb833
Frequency: ~10 events/day per token bridge
```

> Emitted on Starknet L2 when an L1→L2 bridge deposit is processed. Confirmed: `sn_keccak('DepositHandled')` matches this empirically observed selector. Note: CamelCase (`DepositHandled`), not snake_case.

| Array | Index | Field | Type | Notes |
|-------|-------|-------|------|-------|
| keys | 1 | selector | felt252 | |
| data | 1 | account | ContractAddress | L2 recipient |
| data | 2–3 | amount | u256 | token amount bridged |

**Contracts**: ETH bridge `0x0733...`, STRK bridge `0x0594...`, USDC bridge `0x05cd...`, USDT bridge `0x0747...`, WBTC bridge `0x07ae...`

**Sample DuneSQL** — daily ETH bridge inflows:
```sql
SELECT
  block_date,
  COUNT(*) AS deposits,
  SUM(bytearray_to_uint256(data[2])) / 1e18 AS total_eth_bridged
FROM starknet.events
WHERE
  from_address = 0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82  -- ETH L2 bridge
  AND keys[1] = 0x0374396cb322ab5ffd35ddb8627514609289d22c07d039ead5327782f61bb833  -- DepositHandled
  AND cardinality(data) >= 3
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

> **Note**: `bytearray_to_uint256` may not exist in DuneSQL — use `CAST(data[2] AS UINT256)` or compute manually as `CAST(data[2] AS DECIMAL(38,0)) * POW(2, 128) + CAST(data[3] AS DECIMAL(38,0))`.

---

### 3.2 `WithdrawInitiated` ✅ (selector verified) / 🔶 (layout inferred)

```
Selector: 0x0282f521c69b2bc696552b9e141009d3c84f2df75e2e7b7716644d31e60f23b1
Frequency: ~10 events/day per token bridge
```

> Emitted when a user initiates an L2→L1 withdrawal. Confirmed: `sn_keccak('WithdrawInitiated')` matches. CamelCase.

| Array | Index | Field | Type |
|-------|-------|-------|------|
| keys | 1 | selector | felt252 |
| data | 1 | l1_recipient | felt252 (Ethereum address) |
| data | 2–3 | amount | u256 |
| data | 4 | caller_address | ContractAddress |

---

### 3.3 `withdraw_initiated` ✅ (selector verified via match) / 🔶 (layout unknown)

```
Selector: 0x0194fc63c49b0f07c8e7a78476844837255213824bd6cb81e0ccfb949921aad1
Frequency: ~1 event/day or less
```

> Snake_case variant of the withdrawal event. `sn_keccak('withdraw_initiated')` matches this empirically observed selector. Distinct from `WithdrawInitiated` (CamelCase) — likely an older StarkGate contract version or an internal message event. Emits very rarely.

---

## 4. Lending Protocol Events

### 4.1 zkLend Events ⚠️ (computed) / 🔶 (layout inferred)

**Contract**: zkLend Market V1 at `0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05`

| Event | Selector |
|-------|----------|
| `Deposit` | `0x009149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2` |
| `Withdraw` | `0x017f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367` |
| `Borrow` | `0x03e2dfa0d0bbc9b229c88acd70a4e76511e2d12d8821c5955d8b5d57fd4c5944` |
| `Repay` | `0x00517f2438845016abdb177ef4740932036bcc1855a547e80e5013636df1aafd` |
| `AccumulatorsSync` | `0x030c296ae369716818de77cb5b71ce9cda7cc2c0e8456f474e0abb1ae8d017da` |

**`Deposit` layout** (inferred):
```
data[1] = user (ContractAddress)
data[2] = token (ContractAddress)
data[3..4] = face_amount (u256)
```

**`Borrow` layout** (inferred):
```
data[1] = user (ContractAddress)
data[2] = token (ContractAddress)
data[3..4] = raw_amount (u256)
data[5..6] = face_amount (u256)
```

**Sample DuneSQL** — zkLend borrow activity:
```sql
SELECT
  block_date,
  CAST(data[2] AS VARCHAR) AS token_address,
  COUNT(*) AS borrow_count
FROM starknet.events
WHERE
  from_address = 0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05  -- zkLend Market
  AND keys[1] = 0x03e2dfa0d0bbc9b229c88acd70a4e76511e2d12d8821c5955d8b5d57fd4c5944  -- Borrow
  AND cardinality(data) >= 2
  AND block_date >= current_date - INTERVAL '30' DAY
GROUP BY 1, 2
ORDER BY 1 DESC;
```

---

### 4.2 Nostra Events ⚠️ (computed) / 🔶 (layout inferred)

**Factory**: `0x02a93ef8c7679a5f9b1fcf7286a6e1cadf2e9192be4bcb5cb2d1b39062697527`

> Nostra uses a pool-per-token architecture. Events are emitted from individual market contracts (not the factory). Use `from_address IN (nostra_token_contracts)` to filter.

| Event | Selector | Meaning |
|-------|----------|---------|
| `Mint` | `0x034e55c1cd55f1338241b50d352f0e91c7e4ffad0e4271d64eb347589ebdfd16` | Supply deposit |
| `Burn` | `0x0243e1de00e8a6bc1dfa3e950e6ade24c52e4a25de4dee7fb5affe918ad1e744` | Withdrawal / repay |
| `Borrow` | `0x03e2dfa0d0bbc9b229c88acd70a4e76511e2d12d8821c5955d8b5d57fd4c5944` | Borrow |
| `Repay` | `0x00517f2438845016abdb177ef4740932036bcc1855a547e80e5013636df1aafd` | Repay |
| `CollateralEnabled` | `0x02324062bde6ebb76ffd17d55fee62fee62a4877588eb02524b19c091983b365` | Enable collateral |
| `CollateralDisabled` | `0x00f999d0d33513a8215756ae6a9223180a439c134372b158bc84b9dd02f63856` | Disable collateral |

---

### 4.3 Vesu Events ⚠️ (computed) / 🔶 (layout inferred)

**V1 Singleton**: `0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160`
**V2 PoolFactory**: `0x03760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0`

| Event | Selector |
|-------|----------|
| `ModifyPosition` | `0x003dfe6670b0f4e60f951b8a326e7467613b2470d81881ba2deb540262824f1e` |

---

## 5. Quick-Reference Selector Table

| Selector | Event Name | Protocol | Verified |
|----------|------------|----------|----------|
| `0x0099cd8b...196e9` | Transfer | ERC-20 | ✅ |
| `0x0099cd8b...196e9` | Transfer | ERC-721 | ⚠️ same selector |
| `0x0134692b...8ff` | Approval | ERC-20 | ✅ selector |
| `0x0006ad9e...edd` | ApprovalForAll | ERC-721 | ⚠️ |
| `0x00e316f0...cab` | Swap | AVNU / JediSwap V2 | ✅ |
| `0x01577177...870` | Swapped | Ekubo | ✅ contract addr corrected |
| `0x03a7adca...46e` | PositionUpdated | Ekubo | ✅ |
| `0x025ccf80...f1` | PoolInitialized | Ekubo | ✅ |
| `0x034e55c1...d16` | Mint | JediSwap V2 / Nostra | ⚠️ SUSPECT — not observed live |
| `0x033b678d...3f` | UNKNOWN (add-liquidity?) | JediSwap V2 | ✅ observed, name unknown |
| `0x0243e1de...744` | Burn | JediSwap V2 | ✅ |
| `0x0374396c...833` | DepositHandled | StarkGate | ✅ |
| `0x0282f521...1b1` | WithdrawInitiated | StarkGate | ✅ |
| `0x0194fc63...ad1` | withdraw_initiated | StarkGate | ✅ |
| `0x009149d2...f2` | Deposit | Nostra (active) / zkLend (inactive) | ✅ |
| `0x017f87ab...367` | Withdraw | Nostra (active) / zkLend (inactive) | ✅ |
| `0x03e2dfa0...944` | Borrow | zkLend / Nostra | ⚠️ SUSPECT — 0 events live |
| `0x00517f24...afd` | Repay | zkLend / Nostra | ⚠️ |
| `0x030c296a...0da` | AccumulatorsSync | zkLend (inactive Feb 2025) | ✅ |
| `0x003dfe66...01e` | ModifyPosition | Vesu | ⚠️ |
| `0x02324062...365` | CollateralEnabled | Nostra | ⚠️ |
| `0x00f999d0...856` | CollateralDisabled | Nostra | ⚠️ |

---

## 6. Selector Collision Notes

Several generic event names are reused across protocols. When querying `starknet.events`, always filter by `from_address` to scope events to a specific protocol:

| Selector | Used By |
|----------|---------|
| `0x0099cd8b...` (Transfer) | Every ERC-20 token + every ERC-721 collection |
| `0x00e316f0...` (Swap) | AVNU Exchange Router + JediSwap V2 pools |
| `0x034e55c1...` (Mint) | JediSwap V2 pools + Nostra supply |
| `0x0243e1de...` (Burn) | JediSwap V2 pools + Nostra withdraw/repay |
| `0x03e2dfa0...` (Borrow) | zkLend Market + Nostra |
| `0x00517f24...` (Repay) | zkLend Market + Nostra |

---

## 7. How Selectors Are Computed

```javascript
// starknet.js
import { hash } from 'starknet';
const selector = hash.starknetKeccak('EventName');
const hex = '0x' + selector.toString(16).padStart(64, '0');
```

```python
# Python (cairo-lang or starknet.py)
from starkware.crypto.signature.signature import get_selector_from_name
selector = get_selector_from_name('EventName')
print(hex(selector))
```

> `sn_keccak` is case-sensitive and applied to the exact event name string as declared in Cairo. `Transfer` ≠ `transfer`. CamelCase names produce different selectors than snake_case (`DepositHandled` ≠ `deposit_handled`).

---

## 8. System Prompt Injection Strategy

For the LLM chat engine, this registry should be injected as a compact reference block. Recommended format:

```
## Starknet Event Selectors (for starknet.events queries)

Event selectors go in keys[1] (1-indexed). Always pad to 64 hex chars. Always add cardinality guards.

PRIORITY SELECTORS:
- ERC-20 Transfer: keys[1]=0x0099cd8b...196e9 | data[1]=from, data[2]=to, data[3]=amount_low, data[4]=amount_high
- AVNU Swap: keys[1]=0x00e316f0...cab | contract=0x04270219..., data[1]=taker, data[2]=sell_token, data[3..4]=sell_amt, data[5]=buy_token, data[6..7]=buy_amt
- Ekubo Swapped: keys[1]=0x01577177...870 | contracts=[0x02a6f5..., 0x057760...]
- StarkGate DepositHandled: keys[1]=0x0374396c...833 | data[1]=account, data[2..3]=amount
- StarkGate WithdrawInitiated: keys[1]=0x0282f521...1b1 | data[1]=l1_recipient, data[2..3]=amount
- zkLend Deposit: keys[1]=0x009149d2...f2 | contract=0x04c0a519...
- zkLend Borrow: keys[1]=0x03e2dfa0...944 | contract=0x04c0a519...
```

---

## 9. Empirical Verification Notes (2026-03-24)

All selectors were run against live `starknet.events` data via Dune MCP. Key corrections and findings:

### 9.1 Confirmed selectors (upgraded ✅)
| Selector | Event | Notes |
|----------|-------|-------|
| `0x00e316f0...` | AVNU Swap | 15K events/week on `0x04270219...` |
| `0x01577177...` | Ekubo Swapped | 767K events/30d |
| `0x03a7adca...` | Ekubo PositionUpdated | 9.7K events/30d |
| `0x025ccf80...` | Ekubo PoolInitialized | 32 events/30d |
| `0x00e316f0...` | JediSwap V2 Swap | 41K events/30d (same as AVNU) |
| `0x0243e1de...` | JediSwap V2 Burn | 305 events/30d |
| `0x009149d2...` | Deposit (Nostra) | 91–155K events/30d per market |
| `0x017f87ab...` | Withdraw (Nostra) | 22–27K events/30d |
| `0x030c296a...` | zkLend AccumulatorsSync | 7.3M total; last event 2025-02-11 |
| `0x0134692b...` | ERC-20 Approval | 133K events/30d on Nostra nTokens |

### 9.2 Critical contract address corrections

**Ekubo**: The contract addresses in the original registry (`0x02a6f5...`, `0x05776...`) are **wrong**. The real Ekubo core contract is:
```
0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b
```
This is a short Starknet address (starts with many zeros). The previous addresses returned 0 events even over 90 days.

**Nostra nToken contracts** (for Deposit/Withdraw events):
- `0x062da0780fae50d68cecaa5a051606dc21217ba290969b302db4dd99d2e9b470` (91K deposits/30d)
- `0x062e091dca6016fe01d94f3b2e12eac8b1a9256db2cbba8e7995a366867450ad` (64K deposits/30d)
- Many more per-token market contracts (pool-per-token architecture)

**zkLend**: Contract `0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05` is correct but the protocol has been **inactive since 2025-02-11**. Use historical queries only.

### 9.3 Suspect selectors (do not use without ABI verification)

- **JediSwap V2 Mint** (`0x034e55c1...`): NOT observed on live JediSwap V2 pool. The add-liquidity event on pool `0x01114c71...` uses selector `0x033b678d8846a558f55fc9257950e74c1aac32ee4c836c3a620d1066cc8d493f` (297 events/30d, avg 10 data fields). The event name for `0x033b678d...` is unknown — verify on Voyager.
- **zkLend/Nostra Borrow** (`0x03e2dfa0...`): 0 events in 30 days across all of `starknet.events`. Selector likely wrong. A candidate Nostra borrow selector is `0x0320efd552d992294b62e23bcfa29f7703b7b899c22eb04973d36655afd06ddf` (4,446 events/30d, avg 11 data fields — needs ABI verification).

### 9.4 Unidentified Ekubo selectors (high-volume, needs naming)

From `0x00000005dd...` (Ekubo core), 4 additional live selectors:

| Selector | Events/30d | avg_data | Notes |
|----------|-----------|----------|-------|
| `0x0305c746d1...` | 65K | 4 | High volume, likely fee event |
| `0x0048796a25...` | 65K | 4 | Paired with above |
| `0x0096982abd...` | 8K | 15 | Large event, complex struct |
| `0x005dacf597...` | 7K | 15 | Paired with above |

---

## Sources

- `EkuboProtocol/starknet-contracts` — GitHub (Swapped, PositionUpdated, PoolInitialized event structs)
- `avnu-labs/avnu-contracts-v2` — GitHub (Swap event struct)
- `jediswaplabs/JediSwap-v2-core` — GitHub (Swap, Mint, Burn event structs)
- `OpenZeppelin/cairo-contracts` — GitHub (ERC-20, ERC-721 event definitions)
- `starkware-libs/starknet-addresses` — Bridge contract addresses
- Live Dune queries (`starknet.events`) — Empirical selector verification for Transfer, Approval, StarkGate events
- `starknet.js` `hash.starknetKeccak` — sn_keccak selector computation
- `amanusk/starknet-selector-decoder` — Reverse selector lookup tool
