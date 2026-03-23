# chat-dune — Project Specification

## Project Overview

**Name**: chat-dune

**Purpose**: An internal AI-powered blockchain analytics copilot that lets technical users ask natural-language questions about onchain activity and get back interactive charts, tables, and explanations — without writing SQL.

**Problem Statement**: Blockchain analytics is powerful but slow and requiring SQL for any non-trivial query — even for technical users. Existing tools (Dune, Nansen, Flipside) require manual query construction, pre-built dashboards, or deep protocol knowledge before yielding insight. Internal teams at a blockchain infrastructure company need a faster, more interactive, more exploratory interface for onchain investigation.

**Target Users**: Internal technical staff at a blockchain infrastructure company, including:
- Technical product managers
- Data engineers and analysts
- Research and ecosystem teams
- Other technically fluent internal stakeholders

**Differentiators**:
- Conversational, multi-turn analytics experience (not a one-shot query tool)
- Dune MCP as the primary data layer (first-class integration)
- Visual-first output: charts and tables are the default, not SQL
- Iterative graph refinement through follow-up conversation
- Workspace-level address mapping for named entity labeling
- Hybrid data retrieval: Dune primary, RPC/node as fallback and complement
- Claude as both the runtime intelligence and the primary builder of the tool

---

## Architecture

### High-Level System Design

```
┌────────────────────────────────────────────────────────────────┐
│                      Vercel (Frontend)                         │
│                                                                │
│  ┌──────────────────────┐   ┌────────────────────────────┐    │
│  │   Chat UI            │   │   Dashboards / Mappings     │    │
│  │   (threaded convos)  │   │   (saved threads, CSV mgmt) │    │
│  └──────────┬───────────┘   └──────────────┬─────────────┘    │
│             │                               │                  │
│  ┌──────────▼───────────────────────────────▼──────────────┐  │
│  │               Next.js Route Handlers (API)              │  │
│  │  POST /api/chat      → streaming AI response            │  │
│  │  GET/POST /api/threads  → thread CRUD                   │  │
│  │  GET/POST /api/mappings → address mapping CRUD          │  │
│  │  POST /api/export    → CSV/PNG generation               │  │
│  └──────────────────────┬────────────────────────────────── ┘  │
└─────────────────────────┼──────────────────────────────────────┘
                          │
          ┌───────────────┼─────────────────────┐
          │               │                     │
    ┌─────▼──────┐  ┌─────▼──────┐   ┌─────────▼──────┐
    │ Claude API  │  │  Dune MCP  │   │  RPC Providers  │
    │ (Sonnet)    │  │  (primary  │   │  (Starknet RPC, │
    │ tool_use +  │  │   data)    │   │   Ethereum RPC) │
    │ streaming   │  └────────────┘   └─────────────────┘
    └─────────────┘
          │
    ┌─────▼──────────────┐
    │      Supabase       │
    │  PostgreSQL + Auth  │
    │  (threads, msgs,    │
    │   mappings, users)  │
    └─────────────────────┘
```

### Data Flow

1. User types a question in the chat interface
2. The frontend sends the message + thread history to `POST /api/chat`
3. The route handler calls Claude API with the conversation history and a tool set:
   - `execute_dune_query` — runs a Dune SQL query via Dune MCP
   - `fetch_rpc_data` — calls a Starknet/Ethereum RPC endpoint
   - `render_chart` — signals the frontend to render a specific chart type with given data
   - `lookup_address_mappings` — resolves known address labels from the workspace mapping store
4. Claude decides on a query strategy and issues tool calls (primarily to Dune MCP)
5. Tool results return to Claude, which refines, iterates if needed, then produces a structured response
6. The structured response includes: chart spec(s), table data (optional), and an explanation
7. The frontend renders the charts, table, and explanation in the conversation thread
8. The user continues with follow-up questions, which carry the full thread context forward

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Full-stack React with built-in API route handlers; streaming support; Vercel-native |
| Language | TypeScript | Type safety for complex data models; better DX with Zod and Supabase types |
| Styling | Tailwind CSS + shadcn/ui | Rapid, consistent UI with accessible primitives |
| AI | Claude API (claude-sonnet-4-5) via Vercel AI SDK | Best-in-class reasoning for query planning; native tool_use; streaming |
| Data | Dune MCP | First-class AI-native interface to Dune's cross-chain SQL engine |
| Blockchain RPC | Starknet RPC + Ethereum via Alchemy/Infura | Complementary raw data when Dune is insufficient (real-time, not indexed) |
| Charts | Recharts (line, bar, pie) + ECharts (Sankey/flow) | Recharts for lightweight standard charts; ECharts for complex flow diagrams |
| Database | Supabase (PostgreSQL) | Managed Postgres with Auth, Row-Level Security, and real-time capabilities |
| Auth | Supabase Auth (email/password) | Simple, integrated with Supabase DB; supports workspace-level RLS policies |
| State/Fetch | TanStack Query (React Query) | Client-side caching and server state synchronization |
| Validation | Zod | Runtime schema validation for AI-generated chart specs and tool outputs |
| Deployment | Vercel | Zero-config Next.js deployment; edge streaming support |

---

## Project Structure

```
chat-dune/
├── docs/                         # Project documentation
│   ├── SPEC.md
│   ├── STYLES.md
│   └── ROADMAP.md
│
├── frontend/                     # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/           # Auth routes (login, signup)
│   │   │   │   ├── login/
│   │   │   │   └── layout.tsx
│   │   │   ├── (app)/            # Authenticated app routes
│   │   │   │   ├── chat/
│   │   │   │   │   └── [threadId]/
│   │   │   │   ├── dashboards/
│   │   │   │   ├── mappings/
│   │   │   │   └── layout.tsx
│   │   │   ├── api/
│   │   │   │   ├── chat/
│   │   │   │   │   └── route.ts  # Streaming Claude route handler
│   │   │   │   ├── threads/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── mappings/
│   │   │   │   │   └── route.ts
│   │   │   │   └── export/
│   │   │   │       └── route.ts
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── chat/             # Chat UI components
│   │   │   │   ├── ChatThread.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   └── ThreadSidebar.tsx
│   │   │   ├── charts/           # Chart renderers
│   │   │   │   ├── LineChart.tsx
│   │   │   │   ├── BarChart.tsx
│   │   │   │   ├── PieChart.tsx
│   │   │   │   ├── SankeyChart.tsx
│   │   │   │   └── ChartContainer.tsx
│   │   │   ├── results/          # Results rendering
│   │   │   │   ├── ResultCard.tsx
│   │   │   │   ├── DataTable.tsx
│   │   │   │   └── ExplanationBlock.tsx
│   │   │   └── ui/               # shadcn components
│   │   └── lib/
│   │       ├── chat/             # Claude orchestration
│   │       │   ├── tools.ts      # Tool definitions for Claude
│   │       │   ├── system-prompt.ts
│   │       │   └── stream-handler.ts
│   │       ├── dune/             # Dune MCP client
│   │       │   └── client.ts
│   │       ├── rpc/              # RPC adapters
│   │       │   ├── starknet.ts
│   │       │   └── ethereum.ts
│   │       ├── mappings/         # Address mapping service
│   │       │   ├── import.ts
│   │       │   └── lookup.ts
│   │       ├── charts/           # Chart spec builder + validator
│   │       │   ├── spec.ts
│   │       │   └── schema.ts
│   │       └── db/               # Supabase client + typed queries
│   │           ├── client.ts
│   │           └── queries.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── next.config.ts
│
├── supabase/
│   ├── migrations/               # SQL migration files
│   └── seed.sql                  # Dev seed data
│
├── scripts/                      # Utility bash scripts
│   ├── db-reset.sh
│   └── generate-types.sh         # Supabase type generation
│
├── Makefile
└── docker-compose.yml            # Local Supabase stack
```

---

## Core Modules

### Chat Engine (`/lib/chat/`)
Orchestrates multi-turn conversations with Claude. Manages the tool call loop: send message → receive tool call → execute tool → feed result back → repeat until final response. Handles streaming via Vercel AI SDK. Injects address mapping context and chain-specific instructions into the system prompt.

**Key responsibilities**:
- Define and type all Claude tools (`execute_dune_query`, `fetch_rpc_data`, `render_chart`, `lookup_address_mappings`)
- Manage conversation history formatting (Human/Assistant turns with tool_use + tool_result blocks)
- Stream partial text and chart spec events to the frontend

### Dune MCP Client (`/lib/dune/`)
Wrapper around the Dune MCP integration. Exposes a typed interface for Claude's tool calls to execute Dune queries. Handles authentication, error responses, and result normalization.

### RPC Client (`/lib/rpc/`)
Adapters for Starknet RPC (primary) and Ethereum RPC (secondary). Used when Dune is not the right source — e.g., for real-time data, contract reads, or raw transaction lookups. Each adapter exposes a narrow set of typed methods.

### Chart Renderer (`/components/charts/`)
Takes a structured chart spec (validated by Zod) produced by Claude and renders the appropriate Recharts or ECharts component. Chart specs define chart type, axis labels, data series, and optional annotations (e.g., address labels from mappings).

### Address Mapping Service (`/lib/mappings/`)
Handles CSV import, storage, and lookup of workspace-level address-to-entity mappings. Provides a lookup function used both in Claude tool calls and in chart rendering (for labeling addresses with human-readable names).

**CSV format**: `address, chain, name, entity, category, tags`

### Thread Store (`/lib/db/`)
Typed Supabase queries for thread and message CRUD. Messages store structured content (text blocks + chart spec blocks) as JSON. Supports thread pinning (which marks a thread as a "saved dashboard").

---

## Data Models

### `threads`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id     uuid REFERENCES auth.users NOT NULL
title       text NOT NULL
is_pinned   boolean DEFAULT false
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
```

### `messages`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
thread_id   uuid REFERENCES threads NOT NULL
role        text NOT NULL  -- 'user' | 'assistant'
content     jsonb NOT NULL -- MessageContent[]
created_at  timestamptz DEFAULT now()
```

**MessageContent schema** (TypeScript):
```ts
type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'chart'; spec: ChartSpec }
  | { type: 'table'; columns: string[]; rows: unknown[][] }
```

### `address_mappings`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
workspace   text NOT NULL DEFAULT 'default'
address     text NOT NULL
chain       text NOT NULL  -- 'starknet' | 'ethereum'
name        text
entity      text
category    text
tags        text[]
created_by  uuid REFERENCES auth.users
created_at  timestamptz DEFAULT now()
UNIQUE (address, chain)
```

### ChartSpec (Zod-validated JSON)
```ts
type ChartSpec = {
  type: 'line' | 'bar' | 'pie' | 'histogram' | 'sankey'
  title: string
  description?: string
  xAxis?: { label: string; key: string }
  yAxis?: { label: string; key: string }
  series: { name: string; dataKey: string; color?: string }[]
  data: Record<string, unknown>[]
  // For sankey:
  nodes?: { id: string; label: string }[]
  links?: { source: string; target: string; value: number }[]
}
```

---

## API Surface

### `POST /api/chat`
Streams a Claude response for a user message within a thread.

**Request body**:
```json
{
  "threadId": "uuid",
  "message": "string",
  "chain": "starknet | ethereum"
}
```

**Response**: Server-sent events stream (`text/event-stream`) with delta tokens and structured result events.

### `GET /api/threads`
Returns the authenticated user's thread list.

### `POST /api/threads`
Creates a new thread, returns `{ id, title }`.

### `PATCH /api/threads/:id`
Updates a thread (e.g., pin/unpin as dashboard, rename).

### `GET /api/threads/:id/messages`
Returns all messages for a thread with their structured content.

### `GET /api/mappings`
Returns the workspace address mapping table.

### `POST /api/mappings/import`
Accepts a CSV file and upserts address mappings into the workspace store.

### `POST /api/export`
Generates a CSV or PNG export for a given result from a message.

---

## External Integrations

### Dune MCP
The primary data layer. Claude uses the MCP tool interface to run DuneSQL queries against Dune's multi-chain dataset. Authentication via Dune API key. The MCP integration handles query execution, result pagination, and error handling.

### Claude API
Claude (claude-sonnet-4-5) is the runtime intelligence layer. It is invoked for every user message via the Vercel AI SDK. It uses `tool_use` to coordinate data retrieval and chart spec generation. The system prompt includes:
- Supported chains and their Dune table namespaces
- Address mapping context for the current workspace
- Instructions for preferring Dune over RPC, and when to fall back
- Chart spec format specification

### Starknet RPC
Used for real-time or raw data not indexed by Dune: current block, contract state reads, pending transactions. Provider: configurable RPC endpoint (Infura, Blast, or self-hosted node).

### Ethereum RPC (Phase 4+)
Same pattern as Starknet RPC, added in a later phase once Starknet MVP is stable.

### Supabase
PostgreSQL database + Auth. Row-Level Security (RLS) policies ensure users can only access their own threads and shared workspace address mappings.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Dune as primary data source | Dune MCP | Covers the widest range of indexed blockchain data with SQL semantics; MCP makes it natively callable by Claude |
| Claude tool_use over prompt-only | tool_use loop | Structured tool calls enable reliable, typed data retrieval and chart spec generation rather than fragile text parsing |
| Chart spec as JSON contract | Zod-validated ChartSpec | Separates AI output (spec) from rendering (React component), making charts safe to render and easy to extend |
| Address mappings at workspace level | Shared, admin-uploaded | Simplifies access model; all users benefit from shared entity labels without per-user management complexity |
| Supabase for persistence + auth | Supabase | Managed Postgres with built-in RLS, auth, and type generation — avoids running a custom auth server |
| Starknet-first MVP | Starknet only | Scoped for relevance to a Starknet-focused infra company; avoids dual-chain complexity in early phases |
| Thread-as-dashboard | Pin a thread | Simplest dashboard model — no separate builder needed; pinned threads become persistent views |
