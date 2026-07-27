"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayoutToolbar from "@cloudscape-design/components/app-layout-toolbar";
import type { AppLayoutProps } from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import SplitPanel from "@cloudscape-design/components/split-panel";
import HelpPanel from "@cloudscape-design/components/help-panel";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Box from "@cloudscape-design/components/box";
import { TopNav } from "./TopNav";
import { ConsoleSideNav } from "./ConsoleSideNav";
import { ConsoleFooter } from "./ConsoleFooter";
import { HelpContent, ToolsContent } from "./Drawers";
import { Flashbar } from "@/components/ui/Flashbar";
import { useAuth } from "@/context/AuthContext";
import { useDrawer, type SplitData } from "@/context/DrawerContext";

export type Crumb = { label: string; href?: string };

/** Labels for the split panel's position-preferences modal (the gear in its header). */
const SPLIT_PANEL_I18N = {
  preferencesTitle: "Split panel preferences",
  preferencesPositionLabel: "Split panel position",
  preferencesPositionDescription: "Choose the split panel position.",
  preferencesPositionSide: "Switch to right",
  preferencesPositionBottom: "Switch to bottom",
  preferencesConfirm: "Save changes",
  preferencesCancel: "Cancel",
  preferencesCloseAriaLabel: "Close preferences",
  closeButtonAriaLabel: "Close split panel",
  openButtonAriaLabel: "Open split panel",
  resizeHandleAriaLabel: "Resize split panel",
} as const;

function splitPanelHeader(data: SplitData): string {
  const noun = data.noun ?? "hosted zone";
  if (data.count === 1) return data.detailTitle ?? "Hosted zone details";
  return `${data.count} ${noun}${data.count === 1 ? "" : "s"} selected`;
}

function SplitPanelBody({ data, position }: { data: SplitData; position: "side" | "bottom" }) {
  if (data.count === 1 && data.fields?.length) {
    // Docked at the bottom there is room to flow the pairs into columns, like the console does.
    return (
      <KeyValuePairs
        columns={position === "bottom" ? 3 : 1}
        items={data.fields.map((f) => ({ label: f.label, value: f.value }))}
      />
    );
  }
  if (data.count === 1 && data.detail) return <>{data.detail}</>;
  return (
    <Box color="text-status-inactive" padding={{ top: "s" }}>
      Select a {data.noun ?? "hosted zone"} to see its details
    </Box>
  );
}

export function AppShell({
  breadcrumbs,
  children,
  contentType = "table",
  splitPanel = false,
}: {
  breadcrumbs: Crumb[];
  children: ReactNode;
  contentType?: AppLayoutProps.ContentType;
  /** Set on list pages that feed `setSplitData`, so the split panel trigger appears. */
  splitPanel?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(true);
  // Matches the console's details-panel column width; the user can still drag it wider.
  const [splitPanelSize, setSplitPanelSize] = useState(360);
  // Drawer state lives in context so pages can open the Info panel from their
  // heading "Info" links, the way the console does.
  const {
    splitOpen,
    setSplitOpen,
    splitPosition,
    setSplitPosition,
    splitData,
    activeDrawerId,
    setActiveDrawerId,
  } = useDrawer();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="min-h-screen" style={{ backgroundColor: "var(--rz-layout)" }} />;
  }

  return (
    /* The shell is a fixed-height column that never scrolls: TopNav and the footer take their
       natural height, and AppLayoutToolbar fills the gap and scrolls internally.
       Left in normal flow on purpose — taking the header out of flow with `position: fixed`
       makes AppLayout overlap it and swallow the page heading and nav title, while leaving
       the document free to scroll drags the whole side navigation up under the header
       (the reported "nav is glitched after scrolling"). Clamping the outer column instead
       keeps both fixed. */
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Needs its own stacking context above AppLayout: TopNav's dropdowns (account menu,
          Regions, settings) are absolutely positioned and overhang the layout below, which
          otherwise paints over them and swallows clicks — Sign out became unclickable. */}
      <div id="console-top-nav" style={{ position: "relative", zIndex: 1002 }}>
        <TopNav />
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <AppLayoutToolbar
          headerSelector="#console-top-nav"
          footerSelector="#console-footer"
          contentType={contentType}
        content={children}
        notifications={<Flashbar />}
        navigation={<ConsoleSideNav />}
        navigationOpen={navOpen}
        onNavigationChange={({ detail }) => setNavOpen(detail.open)}
        breadcrumbs={
          <BreadcrumbGroup
            items={breadcrumbs.map((c) => ({ text: c.label, href: c.href ?? "#" }))}
            onFollow={(e) => {
              if (!e.detail.href || e.detail.href === "#") return;
              e.preventDefault();
              router.push(e.detail.href);
            }}
          />
        }
        // The reference console exposes the Info panel and Operational
        // troubleshooting as two separately-triggered right-side drawers.
        drawers={[
          {
            id: "info",
            ariaLabels: {
              drawerName: "Hosted zone details",
              closeButton: "Close help panel",
              triggerButton: "Open help panel",
            },
            trigger: { iconName: "status-info" },
            content: (
              <HelpPanel header={<h2>Hosted zone details</h2>}>
                <HelpContent />
              </HelpPanel>
            ),
          },
          {
            id: "troubleshooting",
            ariaLabels: {
              drawerName: "Operational troubleshooting",
              closeButton: "Close operational troubleshooting",
              triggerButton: "Open operational troubleshooting",
            },
            trigger: { iconName: "bug" },
            content: (
              <HelpPanel header={<h2>Operational troubleshooting</h2>}>
                <ToolsContent />
              </HelpPanel>
            ),
          },
        ]}
        activeDrawerId={activeDrawerId}
        onDrawerChange={({ detail }) => setActiveDrawerId(detail.activeDrawerId)}
        splitPanel={
          splitPanel ? (
            <SplitPanel header={splitPanelHeader(splitData)} i18nStrings={SPLIT_PANEL_I18N}>
              <SplitPanelBody data={splitData} position={splitPosition} />
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitOpen}
        onSplitPanelToggle={({ detail }) => setSplitOpen(detail.open)}
        // The console's details panel is a narrow column, not half the page. Kept in state
        // so the resize handle still works and the chosen width sticks while navigating.
        splitPanelSize={splitPanelSize}
        onSplitPanelResize={({ detail }) => setSplitPanelSize(detail.size)}
        splitPanelPreferences={{ position: splitPosition }}
        onSplitPanelPreferencesChange={({ detail }) => setSplitPosition(detail.position)}
        ariaLabels={{
          navigation: "Route 53 navigation",
          navigationToggle: "Open side navigation",
          navigationClose: "Close side navigation",
          tools: "Help panel",
          toolsToggle: "Open help panel",
          toolsClose: "Close help panel",
          notifications: "Notifications",
          }}
        />
      </div>

      <div id="console-footer">
        <ConsoleFooter />
      </div>
    </div>
  );
}
