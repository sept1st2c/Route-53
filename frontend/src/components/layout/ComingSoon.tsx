"use client";

import { AppShell } from "@/components/layout/AppShell";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const BORDER = "var(--rz-border)";
const LINK = "var(--rz-link)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

/**
 * Shared placeholder screen for the mocked Route 53 sections (Dashboard, Health checks,
 * Profiles, Resolver, Traffic flow, …). Keeps the full console chrome — top nav, side nav
 * and breadcrumbs — so only the main panel reads "Coming soon".
 */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <AppShell breadcrumbs={[{ label: "Route 53", href: "/dashboard" }, { label: title }]}>
      <div className="px-7 pt-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Page header */}
        <h1 className="text-[24px] leading-[30px]" style={{ letterSpacing: "-0.48px" }}>
          <span className="font-bold">{title}</span>
        </h1>
        <p className="pb-5 pt-1 text-[14px]" style={{ color: SECONDARY }}>
          {description ?? `Manage your ${title.toLowerCase()} from this console.`}
        </p>

        {/* Coming soon card */}
        <section
          className="flex flex-col items-center justify-center rounded-[16px] bg-[var(--rz-surface)] px-6 py-20 text-center"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--rz-selected)", color: LINK }}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-5 text-[20px] font-bold" style={{ color: INK, letterSpacing: "-0.3px" }}>
            Coming soon
          </h2>
          <p className="mt-2 max-w-[460px] text-[14px] leading-5" style={{ color: MUTED }}>
            This section of the Route 53 console isn&apos;t available yet. Hosted zones and DNS
            records are fully functional — explore those in the meantime.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
