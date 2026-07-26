"use client";

import Link from "next/link";

const LINK = "var(--rz-link)";
const CURRENT = "var(--rz-muted)";
const SEP = "var(--rz-borderstrong)";
const SECONDARY = "var(--rz-secondary)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

export type Crumb = { label: string; href?: string };

function ChevR() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="m5 2 6 6-6 6" strokeLinejoin="round" />
    </svg>
  );
}

function DrawerIcon({ label, active, onClick, children }: { label: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-full"
      style={active ? { backgroundColor: LINK, color: "#fff" } : { color: SECONDARY }}
    >
      {children}
    </button>
  );
}

type DrawerKey = "help" | "tools" | "split";

export function Breadcrumb({
  items,
  navOpen,
  onToggleNav,
  open,
  onToggleDrawer,
}: {
  items: Crumb[];
  navOpen: boolean;
  onToggleNav: () => void;
  open?: Record<DrawerKey, boolean>;
  onToggleDrawer?: (d: DrawerKey) => void;
}) {
  return (
    <div
      className="flex h-[45px] shrink-0 items-center bg-[var(--rz-surface)] pr-4"
      style={{ borderBottom: "1px solid var(--rz-divider)", fontFamily: FONT }}
    >
      <div className="pl-4 pr-1">
        <button
          aria-label={navOpen ? "Close side navigation" : "Open side navigation"}
          onClick={onToggleNav}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full"
          style={navOpen ? { backgroundColor: LINK, color: "#fff" } : { color: "var(--rz-ink)" }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M15 3H1M15 8H1M15 13H1" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <nav aria-label="Breadcrumbs" className="flex-1 px-2">
        <ol className="flex items-center text-[14px] leading-5">
          {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <li key={c.label} className="flex items-center">
                {last || !c.href ? (
                  <span style={{ color: last ? CURRENT : SECONDARY, fontWeight: last ? 700 : 400 }}>{c.label}</span>
                ) : (
                  <Link href={c.href} style={{ color: LINK, textDecoration: "underline" }}>
                    {c.label}
                  </Link>
                )}
                {!last && (
                  <span className="mx-2" style={{ color: SEP }}>
                    <ChevR />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex items-center gap-1">
        <DrawerIcon label="Open split panel" active={!!open?.split} onClick={() => onToggleDrawer?.("split")}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <path d="M15 1H1v14h14V1Z" strokeLinejoin="round" />
            <path d="M11.5 4h-4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5Z" fill="currentColor" />
          </svg>
        </DrawerIcon>
        <DrawerIcon label="Open help panel" active={!!open?.help} onClick={() => onToggleDrawer?.("help")}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <circle cx="8" cy="8" r="7" />
            <path d="M8 12V7M8 6V4" />
          </svg>
        </DrawerIcon>
        <span className="mx-1 h-[25px] w-px" style={{ backgroundColor: "var(--rz-border)" }} />
        <DrawerIcon label="Operational troubleshooting" active={!!open?.tools} onClick={() => onToggleDrawer?.("tools")}>
          <svg fill="none" viewBox="0 0 18 16" width="18" height="16" aria-hidden>
            <path fill="currentColor" d="M12.5837 15.8309L0 15.8309L0 13.8309L12.5837 13.8309L12.5837 15.8309Z" />
            <path fill="currentColor" d="M2.04846 2V9.87919H6.29166V11.8792H1.30864C0.612662 11.8792 0.0484619 11.315 0.0484619 10.619V1.26017C0.0484619 0.564199 0.612661 0 1.30864 0H15.4692C16.1652 0 16.7294 0.564202 16.7294 1.26017V6.92751H14.7294V2H2.04846Z" />
            <path fill="currentColor" d="M15.011 13.5321L10.8164 9.58038L12.2537 8.2263L16.4483 12.178L15.011 13.5321Z" />
            <path fill="currentColor" d="M7.88689 9.61484L6.6217 8.42291L8.05901 7.06883L9.3242 8.26076C9.44674 8.3762 9.64288 8.37858 9.7623 8.26608L10.8585 7.23331C10.978 7.12081 10.9754 6.93602 10.8529 6.82058L9.5877 5.62866L11.025 4.27457L12.2902 5.4665C13.2273 6.34933 13.2466 7.76245 12.3334 8.62279L11.2372 9.65556C10.324 10.5159 8.82398 10.4977 7.88689 9.61484Z" />
          </svg>
        </DrawerIcon>
      </div>
    </div>
  );
}
