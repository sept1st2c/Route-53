"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "./TopNav";
import { SideNav } from "./SideNav";
import { Breadcrumb, Crumb } from "./Breadcrumb";
import { ConsoleFooter } from "./ConsoleFooter";
import { HelpDrawer, ToolsDrawer, SplitDrawerSide, SplitDrawerBottom } from "./Drawers";
import { Flashbar } from "@/components/ui/Flashbar";
import { useAuth } from "@/context/AuthContext";
import { useDrawer } from "@/context/DrawerContext";

export function AppShell({ breadcrumbs, children }: { breadcrumbs: Crumb[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(true);
  const { open, toggle, close, splitPosition, setSplitPosition, splitData } = useDrawer();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="min-h-screen" style={{ backgroundColor: "var(--rz-layout)" }} />;
  }

  const splitSide = open.split && splitPosition === "side";
  const splitBottom = open.split && splitPosition === "bottom";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav />
      <Breadcrumb
        items={breadcrumbs}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((o) => !o)}
        open={open}
        onToggleDrawer={toggle}
      />
      <div className="flex flex-1 overflow-hidden">
        {navOpen && <SideNav onCollapse={() => setNavOpen(false)} />}

        {/* Content column — split panel (bottom mode) docks beneath the row */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Inner row — main content + right-docked drawers all compress each other */}
          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-auto" style={{ backgroundColor: "var(--rz-layout)" }}>
              <Flashbar />
              {children}
            </main>
            {/* Docked order matches the breadcrumb button order: split (selected) → help (details) → tools (operation) */}
            {splitSide && (
              <SplitDrawerSide data={splitData} position={splitPosition} onPosition={setSplitPosition} onClose={() => close("split")} />
            )}
            {open.help && <HelpDrawer onClose={() => close("help")} />}
            {open.tools && <ToolsDrawer onClose={() => close("tools")} />}
          </div>
          {splitBottom && (
            <SplitDrawerBottom data={splitData} position={splitPosition} onPosition={setSplitPosition} onClose={() => close("split")} />
          )}
        </div>
      </div>
      <ConsoleFooter />
    </div>
  );
}
