"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout, { type AppLayoutProps } from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import SplitPanel from "@cloudscape-design/components/split-panel";
import HelpPanel from "@cloudscape-design/components/help-panel";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Box from "@cloudscape-design/components/box";
import { TopNav } from "./TopNav";
import { ConsoleSideNav } from "./ConsoleSideNav";
import { ConsoleFooter } from "./ConsoleFooter";
import { HelpContent } from "./Drawers";
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const { splitOpen, setSplitOpen, splitPosition, setSplitPosition, splitData } = useDrawer();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="min-h-screen" style={{ backgroundColor: "var(--rz-layout)" }} />;
  }

  return (
    <>
      {/* AppLayout measures these to offset its sticky regions (headerSelector/footerSelector). */}
      <div id="console-top-nav">
        <TopNav />
      </div>

      <AppLayout
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
        tools={
          <HelpPanel header={<h2>Hosted zone details</h2>}>
            <HelpContent />
          </HelpPanel>
        }
        toolsOpen={toolsOpen}
        onToolsChange={({ detail }) => setToolsOpen(detail.open)}
        splitPanel={
          splitPanel ? (
            <SplitPanel header={splitPanelHeader(splitData)} i18nStrings={SPLIT_PANEL_I18N}>
              <SplitPanelBody data={splitData} position={splitPosition} />
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitOpen}
        onSplitPanelToggle={({ detail }) => setSplitOpen(detail.open)}
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

      <div id="console-footer">
        <ConsoleFooter />
      </div>
    </>
  );
}
