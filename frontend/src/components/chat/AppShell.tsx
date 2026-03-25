"use client";

import { useState } from "react";
import { ThreadSidebar } from "./ThreadSidebar";

interface AppShellProps {
  children: React.ReactNode;
  userEmail: string | null;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? 52 : 260;

  return (
    <div className="flex h-full min-h-screen bg-[var(--cd-background)]">
      <ThreadSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        userEmail={userEmail}
      />
      <main
        style={{ marginLeft: sidebarWidth }}
        className="flex flex-1 flex-col transition-[margin-left] duration-[250ms] ease-in-out"
      >
        {children}
      </main>
    </div>
  );
}
