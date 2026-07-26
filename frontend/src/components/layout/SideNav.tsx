"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-divider)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

type Item = { label: string; href?: string; badge?: string };
type Group = { label: string; items: Item[] };

const TOP: Item[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Hosted zones", href: "/hosted-zones" },
  { label: "Health checks", href: "/health-checks" },
  { label: "Profiles", href: "/profiles" },
];

// Each of these mocked sections shares one "Coming soon" page per group, so every
// item gets its own `section` query param — otherwise every item with the same
// href would show as active at once (they'd all match a plain pathname check).
const GROUPS: Group[] = [
  { label: "Global Resolver", items: [{ label: "Global resolvers", href: "/resolver?section=global-resolvers", badge: "New" }] },
  {
    label: "VPC Resolver",
    items: [
      { label: "VPCs", href: "/resolver?section=vpcs" },
      { label: "Inbound endpoints", href: "/resolver?section=inbound-endpoints" },
      { label: "Outbound endpoints", href: "/resolver?section=outbound-endpoints" },
      { label: "Rules", href: "/resolver?section=rules" },
      { label: "Query logging", href: "/resolver?section=query-logging" },
      { label: "Outposts", href: "/resolver?section=outposts" },
    ],
  },
  {
    label: "Domains",
    items: [
      { label: "Registered domains" },
      { label: "Requests" },
    ],
  },
  { label: "IP-based routing", items: [{ label: "CIDR collections" }] },
  {
    label: "Traffic flow",
    items: [
      { label: "Traffic policies", href: "/traffic-policies?section=traffic-policies" },
      { label: "Policy records", href: "/traffic-policies?section=policy-records" },
    ],
  },
];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const content = (
    <span className="inline-flex items-center">
      <span>{item.label}</span>
      {item.badge && (
        <span className="ml-2 text-[12px] font-bold leading-4 tracking-[0.06px]" style={{ color: LINK }}>
          {item.badge}
        </span>
      )}
    </span>
  );
  const cls = "block text-[14px] leading-5";
  const style = { color: active ? LINK : SECONDARY, fontWeight: active ? 700 : 400 };
  if (!item.href) {
    return <span className={cls} style={{ ...style, cursor: "default" }}>{content}</span>;
  }
  return (
    <Link href={item.href} className={cls} style={style}>
      {content}
    </Link>
  );
}

export function SideNav({ onCollapse }: { onCollapse: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = (href?: string) => {
    if (!href) return false;
    const [path, query] = href.split("?");
    if (!pathname.startsWith(path)) return false;
    const wantedSection = new URLSearchParams(query).get("section");
    // Items without a `section` param (Dashboard, Hosted zones, …) just need the pathname
    // to match; items that share a route (Resolver, Traffic flow groups) must also agree
    // on which `section` is currently selected, or every item sharing that href would
    // light up together.
    if (!wantedSection) return true;
    return searchParams.get("section") === wantedSection;
  };

  return (
    <nav
      className="flex h-full w-[232px] shrink-0 flex-col overflow-y-auto bg-[var(--rz-surface)] pb-6"
      style={{ borderRight: `1px solid ${BORDER}`, fontFamily: FONT }}
      aria-label="Route 53 navigation"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-7 py-5">
        <Link href="/dashboard" className="text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>
          Route 53
        </Link>
        <button onClick={onCollapse} aria-label="Close side navigation" className="p-1" style={{ color: SECONDARY }}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M11 2 5 8l6 6" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Top links */}
      <ul className="space-y-2 px-7">
        {TOP.map((it) => (
          <li key={it.label}>
            <NavLink item={it} active={isActive(it.href)} />
          </li>
        ))}
      </ul>

      {/* Groups */}
      {GROUPS.map((g) => (
        <CollapsibleGroup key={g.label} group={g} isActive={isActive} />
      ))}

      {/* Footer external link */}
      <div className="mt-2 px-7">
        <span className="flex items-center gap-1 text-[14px]" style={{ color: SECONDARY, cursor: "default" }}>
          DNS Firewall
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <path d="M10 2h4v4M6 10l8-8M14 9.048V14H2V2h5" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </nav>
  );
}

function CollapsibleGroup({ group, isActive }: { group: Group; isActive: (h?: string) => boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4 px-7">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-[14px] font-bold"
        style={{ color: "var(--rz-ink)" }}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden
          style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .1s" }}
        >
          <path d="M8 11 4 5h8l-4 6Z" />
        </svg>
        {group.label}
      </button>
      {open && (
        <ul className="mt-2 space-y-3 pl-5">
          {group.items.map((it) => (
            <li key={it.label}>
              <NavLink item={it} active={isActive(it.href)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
