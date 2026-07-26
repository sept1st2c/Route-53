"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SideNavigation, {
  type SideNavigationProps,
} from "@cloudscape-design/components/side-navigation";

/** The blue "New" flag AWS puts beside recently launched nav items. */
function NewFlag() {
  return (
    <span className="text-[12px] font-bold leading-4" style={{ color: "var(--rz-link)" }}>
      New
    </span>
  );
}

const ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: "/dashboard" },
  { type: "link", text: "Hosted zones", href: "/hosted-zones" },
  { type: "link", text: "Health checks", href: "/health-checks" },
  { type: "link", text: "Profiles", href: "/profiles" },
  {
    type: "section",
    text: "Global Resolver",
    defaultExpanded: true,
    items: [
      {
        type: "link",
        text: "Global resolvers",
        href: "/resolver?section=global-resolvers",
        info: <NewFlag />,
      },
      {
        type: "link",
        text: "Shared DNS views",
        href: "/resolver?section=shared-dns-views",
        info: <NewFlag />,
      },
    ],
  },
  {
    type: "section",
    text: "VPC Resolver",
    defaultExpanded: true,
    items: [
      { type: "link", text: "VPCs", href: "/resolver?section=vpcs" },
      { type: "link", text: "Inbound endpoints", href: "/resolver?section=inbound-endpoints" },
      { type: "link", text: "Outbound endpoints", href: "/resolver?section=outbound-endpoints" },
      { type: "link", text: "Rules", href: "/resolver?section=rules" },
      { type: "link", text: "Query logging", href: "/resolver?section=query-logging" },
      { type: "link", text: "Outposts", href: "/resolver?section=outposts" },
    ],
  },
  {
    type: "section",
    text: "Domains",
    defaultExpanded: true,
    items: [
      { type: "link", text: "Registered domains", href: "/resolver?section=registered-domains" },
      { type: "link", text: "Requests", href: "/resolver?section=requests" },
    ],
  },
  {
    type: "section",
    text: "IP-based routing",
    defaultExpanded: true,
    items: [{ type: "link", text: "CIDR collections", href: "/resolver?section=cidr-collections" }],
  },
  {
    type: "section",
    text: "Traffic flow",
    defaultExpanded: true,
    items: [
      { type: "link", text: "Traffic policies", href: "/traffic-policies?section=traffic-policies" },
      { type: "link", text: "Policy records", href: "/traffic-policies?section=policy-records" },
    ],
  },
  { type: "divider" },
  {
    type: "link",
    text: "DNS Firewall",
    href: "https://console.aws.amazon.com/vpcconsole/home#DNSFirewallRuleGroups",
    external: true,
  },
];

/**
 * Resolve which nav link should render as active. Detail routes such as
 * /hosted-zones/5/records still highlight the "Hosted zones" entry, and the
 * mocked sections that share one route are distinguished by their ?section= slug.
 */
function resolveActiveHref(pathname: string, query: string): string {
  if (pathname.startsWith("/hosted-zones")) return "/hosted-zones";
  if (pathname.startsWith("/resolver") || pathname.startsWith("/traffic-policies")) {
    return query ? `${pathname}?${query}` : pathname;
  }
  return pathname;
}

export function ConsoleSideNav() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();

  return (
    <SideNavigation
      header={{ text: "Route 53", href: "/dashboard" }}
      activeHref={resolveActiveHref(pathname, query)}
      items={ITEMS}
      onFollow={(e) => {
        if (e.detail.external) return;
        e.preventDefault();
        router.push(e.detail.href);
      }}
    />
  );
}
