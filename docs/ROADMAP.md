# chat-dune Development Roadmap

---

## Phase 1: Project Setup

### 1.1 Monorepo Structure and Tooling

**Description**: Establish the top-level project layout, task runner, containerization, and local development infrastructure. Sets the foundation for all subsequent phases.

**Requirements**:
- [x] Create monorepo directory structure: `frontend/`, `supabase/`, `scripts/`, `docs/`
- [x] Create top-level `Makefile` with targets:
  - `make dev` — start Next.js dev server
  - `make run` — start all services (Next.js + local Supabase)
  - `make test` — run frontend tests
  - `make check` — run typecheck + lint + format check
  - `make db-migrate` — run pending Supabase migrations
  - `make db-reset` — reset local DB and re-seed
  - `make db-types` — regenerate TypeScript types from Supabase schema
- [x] Create `docker-compose.yml` for local Supabase stack (Postgres, Auth, Storage, Studio)
- [x] Create `scripts/db-reset.sh` and `scripts/generate-types.sh` as bash scripts
- [x] Create `.env.example` with all required environment variables documented

**Implementation Notes**:
- Use `supabase/config.toml` for local Supabase config (via the Supabase CLI)
- `docker-compose.yml` should pull the official Supabase self-hosted images
- `make db-types` calls `supabase gen types typescript --local > frontend/src/lib/db/types.ts`
- `.env.example` should include: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `DUNE_API_KEY`, `STARKNET_RPC_URL`

---

### 1.2 Next.js Application Initialization

**Description**: Scaffold the Next.js frontend application with all core configuration, dependencies, and tooling.

**Requirements**:
- [x] Run `npx create-next-app@latest frontend --typescript --tailwind --app --src-dir --eslint`
- [x] Install core dependencies:
  - `@anthropic-ai/sdk`, `ai` (Vercel AI SDK)
  - `@supabase/supabase-js`, `@supabase/ssr`
  - `@tanstack/react-query`
  - `recharts`, `echarts`, `echarts-for-react`
  - `zod`
  - `papaparse` (CSV parsing)
  - `lucide-react`
- [x] Install and configure shadcn/ui (`npx shadcn@latest init`)
- [x] Add shadcn components: `button`, `input`, `textarea`, `card`, `dialog`, `dropdown-menu`, `table`, `badge`, `sidebar`, `tooltip`, `separator`
- [x] Configure ESLint with `@typescript-eslint`, Prettier, and `prettier-plugin-tailwindcss`
- [x] Add pre-commit hooks via Husky + lint-staged (typecheck + lint + format on staged files)
- [x] Configure `tsconfig.json` with strict mode and path aliases (`@/*` → `src/*`)
- [x] Set up JetBrains Mono + Inter via `next/font`

**Implementation Notes**:
- Use Next.js App Router exclusively — no Pages Router
- Configure Tailwind CSS with the custom design tokens from `STYLES.md` in `tailwind.config.ts`
- Add `echarts-for-react` for ECharts components; wrap in dynamic import with `ssr: false` since ECharts requires browser APIs
- `papaparse` handles CSV parsing for address mapping imports

---

### 1.3 Page Stubs and Global Layout

**Description**: Create route stubs for all application pages with placeholder content and the global authenticated layout (sidebar + nav).

**Requirements**:
- [x] Create auth layout: `app/(auth)/layout.tsx` — centered card layout, no sidebar
- [x] Create app layout: `app/(app)/layout.tsx` — sidebar + main content area
- [x] Create page stubs with "X Page Coming Soon" text:
  - `app/(auth)/login/page.tsx` — Login page stub
  - `app/(app)/chat/page.tsx` — New Chat landing stub
  - `app/(app)/chat/[threadId]/page.tsx` — Chat thread stub
  - `app/(app)/dashboards/page.tsx` — Saved Dashboards stub
  - `app/(app)/mappings/page.tsx` — Address Mappings stub
- [x] Implement `ThreadSidebar` component with hardcoded mock thread list
- [x] Set up global CSS variables for design tokens from `STYLES.md` in `globals.css`
- [x] Set up TanStack Query provider in the root layout

**Implementation Notes**:
- Sidebar should already implement the collapse interaction (icon-only mode at 52px) even in stub form
- Global CSS variables should map all color tokens from STYLES.md so Tailwind config can reference them via `var(--token-name)`
- Mock data in stubs should look realistic (real-looking thread titles about blockchain queries)

---

### 1.4 CI/CD Pipeline

**Description**: Automated checks on every pull request and merge to main: typecheck, lint, and format validation.

**Requirements**:
- [x] Create `.github/workflows/ci.yml` running on push and PR to main
- [x] CI steps: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`
- [x] Add `typecheck`, `lint`, `format:check`, `format` scripts to `frontend/package.json`
- [x] Configure branch protection on `main` requiring CI to pass before merge

**Implementation Notes**:
- Use `tsc --noEmit` for typecheck (not `next build` — too slow for CI)
- Prettier format check: `prettier --check "src/**/*.{ts,tsx,css}"`
- Cache `node_modules` in CI using `actions/cache` keyed on `package-lock.json` hash

---

## Phase 2: Research

### 2.1 Dune MCP Capabilities Investigation

**Description**: Map exactly what the Dune MCP integration exposes, its query limitations, rate limits, and authentication model. Produce a reference document for the engineering phase.

**Requirements**:
- [ ] Set up Dune API key and test MCP integration locally
- [ ] Document all available MCP tools/capabilities exposed by the Dune MCP server
- [ ] Test Dune's Starknet table coverage: what tables exist, what data is available, how fresh
- [ ] Test query execution latency for typical blockchain analytics queries
- [ ] Identify limitations: max result size, timeout behavior, unsupported query types
- [ ] Produce `research/dune-mcp.md` with findings and recommended query patterns

**Implementation Notes**:
- Reference Dune's official MCP documentation and GitHub repo (search `dune-analytics/mcp`)
- Test representative queries: ERC-20 transfers, event logs, transaction counts by day
- Note whether Dune MCP supports Starknet native data (not just bridged assets) — this is critical
- Include sample DuneSQL queries for each supported query type in the reference doc

---

### 2.2 Starknet Data Landscape on Dune

**Description**: Understand the Starknet-specific data available in Dune — table names, event schemas, known protocol contracts — to inform the system prompt and query planning strategy.

**Requirements**:
- [ ] Map all Starknet-related tables in Dune (e.g., `starknet.transactions`, `starknet.events`, token tables)
- [ ] Document the schema for key tables (columns, data types, event signatures)
- [ ] Identify gaps where Dune lacks Starknet data and RPC must be used instead
- [ ] Catalog known Starknet protocol contract addresses (major DEXes, lending protocols, bridges)
- [ ] Produce `research/starknet-dune.md` with table reference and gap analysis

**Implementation Notes**:
- Use the Dune query editor directly to explore Starknet schema: `SELECT * FROM information_schema.tables WHERE table_schema LIKE '%starknet%'`
- Cross-reference with the Starknet Foundation's published contract registry if available
- The gap analysis directly informs when to fall back to Starknet RPC in the chat engine

---

### 2.3 Claude Tool Use Strategy for Blockchain Analytics

**Description**: Prototype the Claude tool call loop for blockchain analytics queries. Determine the optimal system prompt structure, tool definitions, and multi-step reasoning patterns.

**Requirements**:
- [ ] Build a minimal standalone script (`research/claude-tool-prototype.ts`) that runs a tool call loop
- [ ] Test with 5–10 representative blockchain queries from the examples in SPEC.md
- [ ] Evaluate: does Claude pick the right tool? Does it produce valid DuneSQL? Does it recover from errors?
- [ ] Test iterative refinement: user follow-up questions staying in context, chart modifications
- [ ] Produce `research/claude-strategy.md` with recommended system prompt, tool schemas, and failure handling patterns

**Implementation Notes**:
- Use the Anthropic SDK directly (no Vercel AI SDK) for the prototype to reduce abstraction
- Instrument token usage per query to estimate costs at scale
- Focus especially on address mapping injection: does Claude effectively use address labels when they're provided in context?
- Test the chart spec output schema — confirm Claude reliably produces valid Zod-parseable chart specs

---

## Phase 3: MVP

### 3.1 Database Schema and Migrations

**Description**: Define and migrate the full Supabase database schema for threads, messages, and address mappings. Includes Row-Level Security policies.

**Requirements**:
- [ ] Create migration: `threads` table (id, user_id, title, is_pinned, timestamps)
- [ ] Create migration: `messages` table (id, thread_id, role, content jsonb, timestamps)
- [ ] Create migration: `address_mappings` table (id, workspace, address, chain, name, entity, category, tags[], created_by, timestamps)
- [ ] Implement RLS policies:
  - `threads`: user can only read/write their own threads
  - `messages`: user can only read/write messages in their own threads
  - `address_mappings`: all authenticated users can read workspace mappings; only admins can write
- [ ] Create indexes: `messages(thread_id)`, `address_mappings(address, chain)`, `threads(user_id, updated_at DESC)`
- [ ] Create `supabase/seed.sql` with dev seed data (sample threads, messages, address mappings)
- [ ] Generate TypeScript types with `make db-types`

**Implementation Notes**:
- Define `admin` role via a `user_roles` table or a claim in Supabase Auth JWT — keep it simple for now (hardcode admin emails in an env var or a role column on the users table)
- The `content` column on `messages` stores a `MessageContent[]` JSON array matching the TypeScript type in SPEC.md
- Use `text[]` for `tags` column (Postgres array) — maps cleanly to TypeScript `string[]`

---

### 3.2 Authentication

**Description**: Implement email/password authentication using Supabase Auth. Login, signup, session management, and protected routes.

**Requirements**:
- [ ] Implement Login page (`/login`) with email + password form
- [ ] Implement Signup page (`/signup`) — invite-only or open registration (configurable via env var)
- [ ] Set up Supabase SSR session management using `@supabase/ssr` middleware
- [ ] Protect all `/(app)` routes — redirect unauthenticated users to `/login`
- [ ] Implement logout action (clear session, redirect to `/login`)
- [ ] Display logged-in user email in sidebar footer

**Implementation Notes**:
- Use `@supabase/ssr` `createServerClient` in Next.js middleware (`middleware.ts`) for session refresh on every request
- Use `createBrowserClient` in client components for auth state
- For invite-only mode: disable signup form and only allow login; new users are created via Supabase Dashboard

---

### 3.3 Chat Engine — Claude Integration

**Description**: Implement the core Claude streaming chat loop with tool use. This is the intelligence layer of the entire application.

**Requirements**:
- [ ] Define Claude tool schemas (Zod + Anthropic tool definitions):
  - `execute_dune_query(sql: string, description: string)` → returns rows + column names
  - `render_chart(spec: ChartSpec)` → signals frontend to render a chart
  - `lookup_address_mappings(addresses: string[])` → returns label data for known addresses
  - `fetch_rpc_data(method: string, params: unknown[], chain: string)` → calls Starknet RPC
- [ ] Implement `POST /api/chat` route handler with streaming via Vercel AI SDK
- [ ] Implement the tool call loop: send → receive tool_use → execute tool → send tool_result → repeat
- [ ] Inject workspace address mappings into the system prompt at request time
- [ ] Implement system prompt in `lib/chat/system-prompt.ts` covering:
  - Role definition: Starknet blockchain analytics copilot
  - Available Dune table namespaces for Starknet
  - Chart spec format (exact JSON schema)
  - Rules: prefer Dune, fall back to RPC for real-time data, never expose SQL unless asked
  - Address mapping context (injected dynamically)
- [ ] Persist messages (user + assistant) to Supabase after each exchange
- [ ] Handle tool execution errors gracefully (feed error message back to Claude for recovery)

**Implementation Notes**:
- Use Vercel AI SDK's `streamText` with Anthropic provider for streaming
- The `render_chart` tool is a pseudo-tool — Claude calls it as a signal; the server doesn't execute it, just passes the spec to the client via the stream
- Stream two types of events: `text-delta` (explanation text) and `chart-spec` (structured chart data)
- Keep a tool execution timeout of 30s for Dune queries; surface timeout errors to Claude for retry or fallback
- The system prompt should be regenerated per-request to include fresh address mapping data (not cached)

---

### 3.4 Dune MCP Integration

**Description**: Wire up the Dune MCP client as the execution backend for Claude's `execute_dune_query` tool calls.

**Requirements**:
- [ ] Implement `lib/dune/client.ts` wrapping the Dune MCP integration
- [ ] Expose a typed `executeDuneQuery(sql: string): Promise<DuneResult>` function
- [ ] Handle Dune API authentication (API key via env var)
- [ ] Normalize Dune query results into a consistent `{ columns: string[], rows: unknown[][] }` format
- [ ] Implement error handling: query syntax errors, timeout, API rate limits
- [ ] Add result size guard: truncate to max 500 rows (return count + note to Claude if truncated)

**Implementation Notes**:
- The Dune MCP integration runs as a separate MCP server process; configure it in Claude API tool definitions using the MCP client adapter
- Alternatively, if Dune exposes a direct REST API for query execution, use that directly and skip the MCP process overhead — evaluate during research phase
- Rate limit: Dune's free tier is limited; use the API key associated with the company's Dune account
- Log all queries with their SQL, execution time, and row count to Supabase for debugging

---

### 3.5 Chart Rendering System

**Description**: Build the chart rendering system that takes Claude's structured `ChartSpec` output and renders the appropriate visualization.

**Requirements**:
- [ ] Define `ChartSpec` Zod schema in `lib/charts/schema.ts` (line, bar, pie, histogram, sankey types)
- [ ] Implement `ChartContainer.tsx` — receives a ChartSpec, validates it, renders the correct chart
- [ ] Implement chart components:
  - `LineChart.tsx` — Recharts `LineChart` with multi-series support
  - `BarChart.tsx` — Recharts `BarChart` (grouped or stacked)
  - `PieChart.tsx` — Recharts `PieChart` with legend
  - `SankeyChart.tsx` — ECharts Sankey (dynamically imported, no SSR)
- [ ] Apply address mapping labels to chart data before rendering (replace hex addresses with entity names)
- [ ] Add chart action bar: download PNG, copy as CSV, fullscreen toggle
- [ ] Handle chart spec validation errors gracefully (render error state with raw data table fallback)

**Implementation Notes**:
- Chart components should be fully responsive; use `ResponsiveContainer` in Recharts
- Apply chart color palette from STYLES.md via a shared `CHART_COLORS` constant
- PNG export: use `html2canvas` on the chart container div
- CSV export: serialize `spec.data` to CSV using papaparse's `unparse`
- Address label substitution happens client-side using a locally cached mapping store (fetched once per session)

---

### 3.6 Address Mapping System

**Description**: Allow workspace admins to upload CSV files of address-to-entity mappings, which are then available to all users and automatically injected into Claude's context.

**Requirements**:
- [ ] Implement Address Mappings page (`/mappings`) showing current mapping table
- [ ] Implement CSV upload: drag-and-drop or file picker, parse with papaparse, preview before import
- [ ] Implement `POST /api/mappings/import` route: validate CSV columns, upsert into `address_mappings` table
- [ ] Implement `GET /api/mappings` route returning all workspace mappings (paginated, searchable)
- [ ] Implement `lib/mappings/lookup.ts`: given a list of addresses, return matching mapping records
- [ ] Implement `lib/mappings/inject.ts`: format mappings as a system prompt snippet for Claude context injection
- [ ] Add delete/edit capabilities for individual mapping records (admin only)

**Implementation Notes**:
- Expected CSV columns: `address`, `chain`, `name`, `entity`, `category`, `tags` (tags comma-separated within the cell)
- Validate that `chain` is one of the supported values (`starknet`, `ethereum`)
- System prompt injection format: a compact JSON block or markdown table of known addresses — keep it short enough to not bloat the context window (consider top 100 most-used mappings if the list is large)
- Starknet addresses are 63-char hex strings (0x + 62 hex chars) — validate format on import

---

### 3.7 Thread Management and Chat UI

**Description**: Implement the full chat interface: thread list sidebar, conversation view, message rendering, and the new-thread flow.

**Requirements**:
- [ ] Implement `ThreadSidebar` with real data: list user threads sorted by `updated_at DESC`
- [ ] Implement "New Chat" button → creates a new thread, navigates to `/chat/[threadId]`
- [ ] Implement `ChatThread` view: load messages for thread, render in order
- [ ] Implement `MessageBubble` for user messages; plain render for assistant messages
- [ ] Implement `ResultCard` for assistant results: stacked text explanation + chart(s) + optional data table
- [ ] Implement `ChatInput`: auto-growing textarea, submit on Enter (Shift+Enter for newline), loading state
- [ ] Implement streaming message rendering: show text as it streams in, show chart when spec is complete
- [ ] Implement thread pinning: pin icon in sidebar → marks thread `is_pinned = true` → appears in Dashboards
- [ ] Implement Dashboards page (`/dashboards`): list of pinned threads with preview

**Implementation Notes**:
- Use TanStack Query for thread list and message fetching; invalidate on new message
- The streaming response should show a typing indicator while Claude is thinking (before first token)
- Auto-scroll to bottom on new message; but don't scroll if user has scrolled up (detect scroll position)
- Thread title: auto-generated from the first user message (Claude generates a short title as part of its first response, or derive it client-side from the message text)

---

## Phase 4: Nice to Have

### 4.1 RPC / Node Data Integration

**Description**: Add Starknet RPC as a complementary data source for cases where Dune lacks real-time or specific raw data.

**Requirements**:
- [ ] Implement `lib/rpc/starknet.ts` with typed wrappers for key Starknet JSON-RPC methods:
  - `starknet_getTransactionByHash`
  - `starknet_getEvents`
  - `starknet_call` (contract read)
  - `starknet_getBlockWithTxHashes`
- [ ] Wire up `fetch_rpc_data` tool in the chat engine to call the RPC adapter
- [ ] Add `STARKNET_RPC_URL` env var support (configurable provider)
- [ ] Test Claude's ability to route queries appropriately: Dune for historical, RPC for real-time

**Implementation Notes**:
- Use `starknet.js` library for typed RPC calls rather than raw `fetch`
- RPC calls should have a 10s timeout
- Claude should only use RPC when Dune is insufficient — reinforce this in the system prompt with examples of when each is appropriate

---

### 4.2 Export and Sharing

**Description**: Enable users to export results and share conversation snapshots with colleagues.

**Requirements**:
- [ ] CSV export: download `spec.data` as a CSV file from any chart or table
- [ ] PNG export: render chart to canvas and download as PNG (via `html2canvas`)
- [ ] Shareable thread link: generate a read-only public URL for a thread (`/share/[token]`)
- [ ] Implement `POST /api/threads/:id/share` — creates a share token, returns public URL
- [ ] Implement public read-only thread view at `/share/[token]` (no auth required)

**Implementation Notes**:
- Share tokens should be stored in a `shared_threads` table: `id, thread_id, token, created_at, expires_at`
- Public view should only expose thread title and messages — not user identity or other threads
- PNG export: wrap chart in a fixed-width container (`900px`) before `html2canvas` to ensure consistent output

---

### 4.3 Ethereum Chain Support

**Description**: Extend Dune integration and system prompt to support Ethereum queries alongside Starknet.

**Requirements**:
- [ ] Update system prompt with Ethereum Dune table namespaces (`ethereum.transactions`, `erc20.evt_transfer`, etc.)
- [ ] Add chain selector in the chat UI (Starknet / Ethereum)
- [ ] Update address mapping validation to accept Ethereum addresses (0x + 40 hex chars)
- [ ] Update chart labels and RPC adapter to handle Ethereum-specific data formats
- [ ] Test representative Ethereum queries across all supported query types from SPEC.md

**Implementation Notes**:
- Ethereum Dune data is significantly more mature than Starknet — more tables, better coverage
- Consider adding an `ethereum` chain variant to `lib/rpc/` using `viem` or `ethers.js` for RPC calls
- The chain selector can be per-thread (set at thread creation) or per-message (set in chat input)

---

### 4.4 Production Hardening

**Description**: Observability, error handling, rate limiting, and security hardening for internal production deployment.

**Requirements**:
- [ ] Add structured logging for all API routes (request ID, user ID, tool calls, latency)
- [ ] Add error tracking via Sentry (or equivalent): capture unhandled exceptions + Claude tool failures
- [ ] Implement API rate limiting per user (e.g., 60 messages/hour) using Upstash Redis or Supabase
- [ ] Add request validation on all API routes (Zod schemas for request bodies)
- [ ] Audit and tighten Supabase RLS policies
- [ ] Implement `ANTHROPIC_API_KEY` usage monitoring — alert if daily spend exceeds threshold
- [ ] Add health check endpoint: `GET /api/health` returning service status

**Implementation Notes**:
- Use `@vercel/otel` for OpenTelemetry tracing if deploying to Vercel
- For rate limiting without Redis: use a `request_logs` Supabase table and count recent rows (simpler, slightly slower)
- Cost monitoring: log token usage per API call to Supabase; build a simple internal usage dashboard

---

## Phase 5: Future

### 5.1 Multi-Chain Expansion

**Description**: Extend the platform to support all Dune-indexed chains beyond Ethereum and Starknet, making chat-dune a universal blockchain analytics copilot.

**Features**:
- Support for all major EVM chains on Dune (Arbitrum, Optimism, Base, Polygon, BSC)
- Cross-chain comparative queries ("compare DEX volume on Ethereum vs Arbitrum vs Starknet")
- Chain-specific system prompt modules loaded dynamically based on selected chains
- Multi-chain address mapping (same entity mapped across chains)

**Rationale**: The architecture is designed to be chain-agnostic from day one. Expanding to additional chains is primarily a system prompt and data schema update, not an architectural change. As the internal team's work spans more chains, the tool should expand accordingly.

---

### 5.2 Scheduled Reports and Alerts

**Description**: Enable users to schedule recurring analytics reports and set up threshold-based alerts on blockchain activity.

**Features**:
- Schedule a query/thread to re-run on a cron (daily, weekly)
- Email or Slack delivery of results
- Alert rules: "notify me when value transferred in this token exceeds X in 24h"
- Dashboard snapshots delivered on schedule

**Rationale**: Ad-hoc analysis is the MVP use case, but recurring monitoring is a natural evolution. Internal teams want automated visibility into onchain activity without running manual queries each day.

---

### 5.3 Collaborative Features

**Description**: Enable teams to collaborate on analytics threads, share annotations, and build shared knowledge.

**Features**:
- Shared threads accessible to multiple users (not just the creator)
- Commenting and annotation on charts and messages
- Workspace-wide public dashboards (pinned dashboards visible to all workspace members)
- @mentions to tag colleagues in threads

**Rationale**: Insights generated during analytics sessions have high value beyond the individual analyst. Making threads collaborative turns individual investigation into shared institutional knowledge.

---

### 5.4 Advanced AI Capabilities

**Description**: Evolve the AI layer from reactive question-answering to proactive insight generation and anomaly detection.

**Features**:
- Proactive anomaly detection: Claude surfaces unusual activity without being asked
- Suggested follow-up questions after each response
- Natural language query suggestions based on thread context
- Automated entity classification for unlabeled addresses
- Multi-agent mode: parallel query execution across chains for faster complex analysis

**Rationale**: The current model requires users to know what to ask. Proactive intelligence reduces the gap further — catching things users didn't think to look for and guiding less experienced analysts toward the right questions.
