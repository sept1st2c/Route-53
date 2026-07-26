"use client";

import { ReactNode, useState } from "react";
import type { SplitData, SplitPosition } from "@/context/DrawerContext";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const SURFACE = "var(--rz-surface)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

function ChevronRight() {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="m5 2 6 6-6 6" strokeLinejoin="round" /></svg>;
}
function ChevronDown() {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="m2 5 6 6 6-6" strokeLinejoin="round" /></svg>;
}
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M6.11 1.729c.07-.42.44-.729.86-.729h2.02c.43 0 .79.31.86.729l.17.999c.05.29.24.529.5.679.06.03.11.06.17.1.25.15.56.2.84.1l.95-.35c.4-.15.85 0 1.07.38l1.01 1.747c.21.37.13.839-.2 1.108l-.78.64c-.23.189-.34.479-.33.768v.2c0 .29.11.579.33.769l.78.639c.33.27.42.739.2 1.108l-1.01 1.748c-.21.37-.66.529-1.06.38l-.95-.35a.966.966 0 0 0-.84.1c-.06.03-.11.07-.17.1-.26.14-.45.389-.5.679l-.17.998A.878.878 0 0 1 9 15H6.98a.87.87 0 0 1-.86-.729l-.17-.998a.988.988 0 0 0-.5-.68c-.06-.03-.11-.06-.17-.1a.996.996 0 0 0-.84-.1l-.95.35c-.4.15-.85 0-1.06-.38l-1.01-1.747a.873.873 0 0 1 .2-1.108l.78-.64c.23-.189.34-.479.33-.768v-.2c0-.3-.11-.579-.33-.769l-.78-.639a.861.861 0 0 1-.2-1.108l1.01-1.748c.21-.37.66-.529 1.07-.38l.95.35c.28.1.58.06.84-.1.06-.03.11-.07.17-.1.26-.14.45-.379.5-.678l.15-1Z" strokeLinejoin="round" />
      <path d="M10 8c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2Z" strokeLinejoin="round" />
    </svg>
  );
}
function ExternalIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden className="ml-1 inline-block"><path d="M13 9.012v-6H7M13.02 3 7 9.01M3 5.012v8h8.01" strokeLinejoin="round" /></svg>;
}
function ThumbsIcon({ up }: { up?: boolean }) {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden style={up ? undefined : { transform: "rotate(180deg)" }}><path d="M9 2.871v4.13h4.12c.6 0 1.02.59.83 1.16l-1.6 4.77a1.58 1.58 0 0 1-1.49 1.07H1v-8h4l2.41-3.61c.48-.72 1.59-.38 1.59.48ZM5 14.001v-8" strokeLinejoin="round" /></svg>;
}

function IconBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--rz-hover)]" style={{ color: SECONDARY }}>
      {children}
    </button>
  );
}

/* ─── Split-panel position preferences (gear → Bottom / Side) ─────────────── */
function PositionPrefs({ position, onChange }: { position: SplitPosition; onChange: (p: SplitPosition) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconBtn label="Split panel preferences" onClick={() => setOpen((o) => !o)}><GearIcon /></IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full z-50 mt-1 w-[200px] rounded-lg py-2" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, boxShadow: "rgba(0,7,22,0.12) 0 4px 16px 0", color: INK }}>
            <p className="px-3 pb-1 text-[12px] font-bold" style={{ color: MUTED }}>Split panel position</p>
            {(["side", "bottom"] as const).map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[14px] hover:bg-[var(--rz-hover)]">
                <input type="radio" name="split-position" checked={position === p} onChange={() => { onChange(p); setOpen(false); }} style={{ accentColor: LINK }} />
                {p === "side" ? "Side" : "Bottom"}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Help content (Hosted zone details) ─────────────────────────────────── */
export function HelpContent() {
  const [helpful, setHelpful] = useState<null | "yes" | "no">(null);
  const items: [string, string][] = [
    ["Hosted zone ID", "Route 53 assigns the ID when you create a hosted zone. The main use for this ID is programmatic access to the hosted zone."],
    ["Description", "In the list of hosted zones, this value lets you distinguish hosted zones that have the same name. A description is optional."],
    ["Type", "The type specifies whether this is a public hosted zone (for routing traffic on the internet) or a private hosted zone (for routing traffic within and among VPCs)."],
    ["Name servers", "Route 53 assigns name servers when you create a hosted zone. The assigned name servers can't be changed. To make Route 53 the DNS service for a domain, you update the domain registration to use these name servers."],
    ["Record count", "The total number of records in a hosted zone, including the default NS and SOA records."],
  ];
  return (
    <div className="px-7 pb-10 pt-1" style={{ color: SECONDARY }}>
      <p className="mb-3 text-[14px]">The details page for a hosted zone include the following information:</p>
      <ul className="flex list-disc flex-col gap-3 pl-5 text-[14px]">
        {items.map(([t, d]) => (<li key={t}><b style={{ color: INK }}>{t}</b>: {d}</li>))}
      </ul>
      <h3 className="mt-6 text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>Was this content helpful?</h3>
      <div className="mt-3 flex gap-2">
        {(["yes", "no"] as const).map((v) => (
          <button key={v} onClick={() => setHelpful(v)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-[14px] font-bold" style={{ border: `1px solid ${helpful === v ? LINK : "var(--rz-borderstrong)"}`, color: helpful === v ? LINK : SECONDARY, backgroundColor: SURFACE }}>
            <ThumbsIcon up={v === "yes"} /> {v === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
      <hr className="my-6" style={{ borderColor: BORDER }} />
      <h3 className="text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>Learn more <ExternalIcon /></h3>
      <ul className="mt-3 text-[14px]">
        <li><a href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/MigratingDNS.html" target="_blank" rel="noopener noreferrer" style={{ color: LINK }}>Making Route 53 the DNS service for an existing domain</a></li>
      </ul>
    </div>
  );
}

/* ─── Operational troubleshooting content ────────────────────────────────── */
export function ToolsContent() {
  const [tab, setTab] = useState<"explore" | "investigate">("explore");
  const TabBtn = ({ id, label }: { id: "explore" | "investigate"; label: string }) => {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} className="relative px-3 py-2 text-[14px] font-bold" style={{ color: active ? LINK : SECONDARY }}>
        {label}
        {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full" style={{ backgroundColor: LINK }} />}
      </button>
    );
  };
  return (
    <div>
      <div className="flex px-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <TabBtn id="explore" label="Explore related" />
        <TabBtn id="investigate" label="Investigate" />
      </div>
      <div className="px-7 pb-10 pt-4 text-[14px]" style={{ color: MUTED }}>
        {tab === "explore"
          ? "Explore resources and telemetry related to this hosted zone to understand its current state."
          : "Start an investigation to troubleshoot operational issues affecting this resource."}
      </div>
    </div>
  );
}

function SplitBody({ data }: { data: SplitData }) {
  if (data.count === 1 && data.detail) return <div className="overflow-y-auto px-7 pb-8 pt-1">{data.detail}</div>;
  const noun = data.noun ?? "hosted zone";
  return <div className="flex flex-1 items-center justify-center px-7 py-10 text-[14px]" style={{ color: MUTED }}>Select a {noun} to see its details</div>;
}

const splitTitle = (count: number, noun = "hosted zone") => `${count} ${noun}${count === 1 ? "" : "s"} selected`;
const splitHeading = (data: SplitData) =>
  data.count === 1 ? data.detailTitle ?? "Hosted zone details" : splitTitle(data.count, data.noun);

/* ─── Generic right-docked drawer (pushes content) ───────────────────────── */
export function HelpDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="flex h-full w-[340px] max-w-[85vw] shrink-0 flex-col overflow-y-auto" style={{ backgroundColor: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT }}>
      <div className="flex items-start justify-between px-7 pb-2 pt-4">
        <h2 className="pr-4 text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>Hosted zone details</h2>
        <IconBtn label="Close help panel" onClick={onClose}><ChevronRight /></IconBtn>
      </div>
      <HelpContent />
    </aside>
  );
}

export function ToolsDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="flex h-full w-[340px] max-w-[85vw] shrink-0 flex-col overflow-y-auto" style={{ backgroundColor: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT }}>
      <div className="flex items-start justify-between px-7 pb-2 pt-4">
        <h2 className="pr-4 text-[20px] font-bold" style={{ color: INK, letterSpacing: "-0.3px" }}>Operational troubleshooting</h2>
        <IconBtn label="Close" onClick={onClose}><ChevronRight /></IconBtn>
      </div>
      <ToolsContent />
    </aside>
  );
}

/* ─── Split panel — side (right dock) or bottom bar ──────────────────────── */
export function SplitDrawerSide({ data, position, onPosition, onClose }: { data: SplitData; position: SplitPosition; onPosition: (p: SplitPosition) => void; onClose: () => void }) {
  return (
    <aside className="flex h-full w-[388px] max-w-[90vw] shrink-0 flex-col overflow-hidden" style={{ backgroundColor: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT }}>
      <div className="flex items-start justify-between px-7 pb-2 pt-4">
        <h2 className="pr-4 text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>{splitHeading(data)}</h2>
        <div className="flex items-center">
          <PositionPrefs position={position} onChange={onPosition} />
          <IconBtn label="Close" onClick={onClose}><ChevronRight /></IconBtn>
        </div>
      </div>
      <SplitBody data={data} />
    </aside>
  );
}

export function SplitDrawerBottom({ data, position, onPosition, onClose }: { data: SplitData; position: SplitPosition; onPosition: (p: SplitPosition) => void; onClose: () => void }) {
  return (
    <section className="flex h-[280px] shrink-0 flex-col" style={{ backgroundColor: SURFACE, borderTop: `1px solid ${BORDER}`, fontFamily: FONT }}>
      <div className="flex items-center justify-between px-7 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <h2 className="text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>{splitHeading(data)}</h2>
        <div className="flex items-center gap-1">
          <PositionPrefs position={position} onChange={onPosition} />
          <IconBtn label="Close" onClick={onClose}><ChevronDown /></IconBtn>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <SplitBody data={data} />
      </div>
    </section>
  );
}
