# chat-dune — Styles Specification

## Design Philosophy

Clean, information-dense, and purposeful. The interface should feel like a premium internal tool — not a consumer app, but not a developer-only utility either. Think linear.app meets a Bloomberg terminal: dark by default, high contrast, excellent typography, with data as the hero.

Key principles:
- **Data first**: Charts and tables are never an afterthought — they are the primary content
- **Calm precision**: Reduce visual noise; every element earns its place
- **Conversational rhythm**: The chat layout should feel natural, not sterile — slightly warmer than a typical dev tool
- **Dark-native**: Dark mode is the primary design target; light mode is secondary

---

## Color Palette

### Base (Dark Mode — Primary)

| Token | Hex | Usage |
|---|---|---|
| `background` | `#0A0A0B` | App background |
| `surface` | `#111113` | Cards, panels, sidebars |
| `surface-raised` | `#1A1A1E` | Elevated cards, modals |
| `surface-overlay` | `#222228` | Hover states, dropdowns |
| `border` | `#2A2A32` | Dividers, card borders |
| `border-subtle` | `#1E1E24` | Subtle separators |

### Text

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#F0F0F5` | Primary content |
| `text-secondary` | `#9898A8` | Labels, captions, metadata |
| `text-tertiary` | `#5A5A6A` | Placeholders, disabled |
| `text-inverse` | `#0A0A0B` | Text on light/accent backgrounds |

### Accent (Brand)

| Token | Hex | Usage |
|---|---|---|
| `accent` | `#7B6EF6` | Primary interactive elements, CTA buttons |
| `accent-hover` | `#6B5EE6` | Accent hover state |
| `accent-subtle` | `#7B6EF614` | Accent tint backgrounds (badges, highlights) |
| `accent-muted` | `#4A4480` | Muted accent for secondary selections |

### Semantic

| Token | Hex | Usage |
|---|---|---|
| `success` | `#22C55E` | Positive values, confirmed states |
| `success-subtle` | `#22C55E14` | Success background tints |
| `warning` | `#F59E0B` | Caution, pending states |
| `warning-subtle` | `#F59E0B14` | Warning background tints |
| `error` | `#EF4444` | Errors, negative values, failed states |
| `error-subtle` | `#EF444414` | Error background tints |
| `info` | `#3B82F6` | Informational, neutral highlights |
| `info-subtle` | `#3B82F614` | Info background tints |

### Chart Colors

A curated palette designed for blockchain data visualization — distinct at a glance, cohesive as a set:

```
Series 1:  #7B6EF6  (accent purple)
Series 2:  #22D3EE  (cyan)
Series 3:  #F59E0B  (amber)
Series 4:  #22C55E  (green)
Series 5:  #F43F5E  (rose)
Series 6:  #A78BFA  (lavender)
Series 7:  #34D399  (emerald)
Series 8:  #FB923C  (orange)
```

### Light Mode Overrides (Secondary)

| Token | Light Value |
|---|---|
| `background` | `#FAFAFA` |
| `surface` | `#FFFFFF` |
| `surface-raised` | `#F4F4F6` |
| `border` | `#E4E4E8` |
| `text-primary` | `#0A0A0B` |
| `text-secondary` | `#5A5A6A` |
| `accent` | `#6B5EE6` |

---

## Typography

### Font Stack

```css
/* Primary — UI and body text */
font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;

/* Monospace — SQL, addresses, code, hash values */
font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace;
```

Use `next/font` to load Inter and JetBrains Mono from Google Fonts.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `display` | 28px | 600 | 1.2 | Page titles |
| `heading-lg` | 20px | 600 | 1.3 | Section headers, panel titles |
| `heading-md` | 16px | 600 | 1.4 | Card titles, group labels |
| `heading-sm` | 14px | 500 | 1.4 | Subsection labels |
| `body-lg` | 16px | 400 | 1.6 | Chat messages, primary content |
| `body-md` | 14px | 400 | 1.6 | UI labels, metadata, most UI text |
| `body-sm` | 13px | 400 | 1.5 | Captions, timestamps, secondary info |
| `caption` | 12px | 400 | 1.4 | Fine print, chart axis labels |
| `mono-md` | 13px | 400 | 1.5 | Addresses, hashes, SQL, code |
| `mono-sm` | 12px | 400 | 1.4 | Inline code in text |

---

## Spacing & Layout

### Spacing Scale

Based on a 4px base unit:

```
0.5 → 2px    (hairline)
1   → 4px    (micro)
2   → 8px    (tight)
3   → 12px   (small)
4   → 16px   (base)
5   → 20px   (medium)
6   → 24px   (comfortable)
8   → 32px   (large)
10  → 40px   (xl)
12  → 48px   (2xl)
16  → 64px   (3xl)
```

### Layout

```
App shell:
  Sidebar width:         260px (collapsed: 52px)
  Main content max-width: 900px (centered in remaining space)
  Top nav height:         52px

Chat thread:
  Message max-width:      720px
  User bubble padding:    12px 16px
  Assistant content:      full width within thread container

Chart container:
  Default height:         360px
  Compact height:         240px
  Full-height:            520px

Grid: 12-column grid, 24px gutters
Breakpoints:
  sm:  640px
  md:  768px
  lg:  1024px
  xl:  1280px
```

---

## Component Styling

### Buttons

```
Primary:    bg-accent text-white, hover: bg-accent-hover, rounded-md px-4 py-2 text-sm font-medium
Secondary:  bg-surface-overlay text-text-primary border border-border, hover: bg-surface-raised
Ghost:      transparent text-text-secondary, hover: bg-surface-overlay text-text-primary
Danger:     bg-error/10 text-error border border-error/20, hover: bg-error/20
Icon:       32×32px, rounded-md, ghost style
```

### Inputs

```
Base:          bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary
Focus:         border-accent/60 ring-2 ring-accent/20 outline-none
Placeholder:   text-text-tertiary
Error state:   border-error ring-2 ring-error/20
Disabled:      opacity-50 cursor-not-allowed
Chat input:    bg-surface-raised border border-border rounded-xl px-4 py-3 pr-12 text-body-lg
               resize-none, max-height: 240px, auto-grows from single line
```

### Cards

```
Base:          bg-surface border border-border rounded-xl p-4
Elevated:      bg-surface-raised border border-border/60 shadow-md rounded-xl
Result card:   bg-surface border border-border rounded-xl overflow-hidden
               Header: px-4 py-3 border-b border-border
               Body: p-4
Hover state:   border-border/80 transition-colors duration-150
```

### Chat Messages

```
User message:
  Container:   flex justify-end
  Bubble:      bg-accent/10 border border-accent/20 rounded-2xl rounded-tr-sm
               px-4 py-3 max-w-[520px] text-body-lg

Assistant message:
  Container:   flex flex-col gap-3 (text, then charts/tables stacked)
  Text:        text-text-primary text-body-lg leading-relaxed
  No bubble:   assistant content renders directly without a bubble wrapper
```

### Data Tables

```
Container:     overflow-x-auto rounded-lg border border-border
Table:         w-full text-sm border-collapse
Header row:    bg-surface-overlay text-text-secondary font-medium
               th: px-4 py-2.5 text-left border-b border-border
Data row:      border-b border-border/40, hover: bg-surface-overlay/40
               td: px-4 py-2.5 text-text-primary font-mono (for addresses/hashes)
Striped:       odd rows: transparent, even rows: bg-surface-raised/40
```

### Navigation & Sidebar

```
Sidebar:       bg-surface border-r border-border fixed left-0 top-0 h-screen
Thread item:   px-3 py-2 rounded-md text-sm text-text-secondary cursor-pointer
               hover: bg-surface-overlay text-text-primary
               active: bg-accent/10 text-accent font-medium
Section label: px-3 py-1.5 text-caption text-text-tertiary uppercase tracking-wider
```

### Badges & Tags

```
Default:  bg-surface-overlay text-text-secondary rounded-full px-2.5 py-0.5 text-caption
Chain:    Starknet → bg-[#EC796B]/10 text-[#EC796B]; Ethereum → bg-[#627EEA]/10 text-[#627EEA]
Category: accent-subtle + accent text
Status:   success/warning/error semantic tokens
```

---

## Motion & Animation

```
Transition base:     150ms ease-out
Interaction hover:   100ms ease-out (border, background color changes)
Modal/panel open:    200ms ease-out (opacity + translateY 4px → 0)
Modal/panel close:   150ms ease-in
Streaming text:      No animation — render directly for low latency feel
Chart mount:         300ms ease-out opacity fade-in (avoid layout shift)
Sidebar collapse:    250ms ease-in-out (width transition)
```

Principles: Prefer short, purposeful transitions. Never animate layout changes that would cause reflow during streaming. Charts fade in once complete — never animate during data load.

---

## Iconography

**Library**: [Lucide React](https://lucide.dev) — clean, consistent 24px stroke icons.

```
Default size:  16px (in-text, buttons) / 20px (navigation) / 24px (feature icons)
Stroke width:  1.5px default
Color:         inherit from text color context
```

Common icons used:
- `MessageSquare` — threads
- `BarChart2` — charts / analytics
- `Network` — flow diagrams
- `Table2` — tables
- `Upload` — CSV import
- `Pin` — pin as dashboard
- `Download` — export
- `Copy` — copy address / SQL
- `ChevronRight` / `ChevronDown` — navigation

---

## Shadows & Elevation

```
sm:    0 1px 2px rgba(0,0,0,0.3)                          (subtle, borders preferred)
md:    0 4px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)   (cards, dropdowns)
lg:    0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)   (modals, floating panels)
glow:  0 0 0 1px rgba(123,110,246,0.3), 0 0 16px rgba(123,110,246,0.15) (focused inputs, active selections)
```

Dark backgrounds require stronger shadows. Use `border` + subtle shadow over shadow alone.

---

## Border Radius

```
none:  0px    (table rows, full-bleed elements)
sm:    4px    (badges, tags, small chips)
md:    8px    (buttons, inputs, small cards)
lg:    12px   (cards, panels)
xl:    16px   (large cards, feature containers)
2xl:   24px   (chat bubbles, modals)
full:  9999px (pill badges, avatar circles, toggle switches)
```
