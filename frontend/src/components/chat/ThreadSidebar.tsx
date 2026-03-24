"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  BarChart2,
  MapPin,
  Pin,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";

interface Thread {
  id: string;
  title: string;
  updatedAt: string;
  isPinned: boolean;
}

const MOCK_THREADS: Thread[] = [
  {
    id: "1",
    title: "Starknet daily active users last 90 days",
    updatedAt: "2h ago",
    isPinned: true,
  },
  {
    id: "2",
    title: "Top DEX protocols by volume on Starknet",
    updatedAt: "5h ago",
    isPinned: true,
  },
  {
    id: "3",
    title: "Bridge inflows from Ethereum to Starknet",
    updatedAt: "1d ago",
    isPinned: false,
  },
  {
    id: "4",
    title: "ERC-20 transfer activity for STRK token",
    updatedAt: "1d ago",
    isPinned: false,
  },
  {
    id: "5",
    title: "Gas fees trend on Starknet post-v0.13",
    updatedAt: "2d ago",
    isPinned: false,
  },
  {
    id: "6",
    title: "JediSwap liquidity pool TVL over time",
    updatedAt: "3d ago",
    isPinned: false,
  },
  {
    id: "7",
    title: "NFT mint activity on Starknet marketplaces",
    updatedAt: "4d ago",
    isPinned: false,
  },
  {
    id: "8",
    title: "Wallet cohort retention by first tx date",
    updatedAt: "5d ago",
    isPinned: false,
  },
];

const NAV_ITEMS = [
  { href: "/chat", label: "New Chat", icon: Plus },
  { href: "/dashboards", label: "Dashboards", icon: BarChart2 },
  { href: "/mappings", label: "Address Mappings", icon: MapPin },
];

interface ThreadSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function ThreadSidebar({ collapsed, onToggle }: ThreadSidebarProps) {
  const pathname = usePathname();

  const pinned = MOCK_THREADS.filter((t) => t.isPinned);
  const recent = MOCK_THREADS.filter((t) => !t.isPinned);

  const isThreadActive = (id: string) => pathname === `/chat/${id}`;
  const isNavActive = (href: string) => {
    if (href === "/chat") return pathname === "/chat";
    return pathname.startsWith(href);
  };

  return (
    <aside
      style={{ width: collapsed ? 52 : 260 }}
      className="fixed left-0 top-0 flex h-screen flex-col overflow-hidden border-r border-[var(--cd-border)] bg-[var(--cd-surface)] transition-[width] duration-[250ms] ease-in-out"
    >
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center justify-between px-3">
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-[var(--cd-text-primary)]">
            chat-dune
          </span>
        )}
        <button
          onClick={onToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--cd-text-secondary)] transition-colors duration-100 hover:bg-[var(--cd-surface-overlay)] hover:text-[var(--cd-text-primary)]"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} strokeWidth={1.5} />
          ) : (
            <PanelLeftClose size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Nav items */}
      <nav className="shrink-0 px-2 pb-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-100 ${
              isNavActive(href)
                ? "bg-[var(--cd-accent-subtle)] font-medium text-[var(--cd-accent)]"
                : "text-[var(--cd-text-secondary)] hover:bg-[var(--cd-surface-overlay)] hover:text-[var(--cd-text-primary)]"
            }`}
          >
            <Icon size={16} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        ))}
      </nav>

      <div className="mx-3 border-t border-[var(--cd-border-subtle)]" />

      {/* Thread list */}
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {pinned.length > 0 && (
            <div className="mb-1">
              <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--cd-text-tertiary)]">
                Pinned
              </p>
              {pinned.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  active={isThreadActive(thread.id)}
                  pinned
                />
              ))}
            </div>
          )}

          {recent.length > 0 && (
            <div>
              <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--cd-text-tertiary)]">
                Recent
              </p>
              {recent.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  active={isThreadActive(thread.id)}
                  pinned={false}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {collapsed && <div className="flex-1" />}
    </aside>
  );
}

function ThreadItem({
  thread,
  active,
  pinned,
}: {
  thread: Thread;
  active: boolean;
  pinned: boolean;
}) {
  return (
    <Link
      href={`/chat/${thread.id}`}
      className={`group flex h-9 items-center gap-2 rounded-md px-2.5 text-sm transition-colors duration-100 ${
        active
          ? "bg-[var(--cd-accent-subtle)] font-medium text-[var(--cd-accent)]"
          : "text-[var(--cd-text-secondary)] hover:bg-[var(--cd-surface-overlay)] hover:text-[var(--cd-text-primary)]"
      }`}
    >
      {pinned ? (
        <Pin size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
      ) : (
        <MessageSquare
          size={12}
          strokeWidth={1.5}
          className="shrink-0 opacity-40"
        />
      )}
      <span className="flex-1 truncate">{thread.title}</span>
      <span className="shrink-0 text-[11px] text-[var(--cd-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
        {thread.updatedAt}
      </span>
    </Link>
  );
}
