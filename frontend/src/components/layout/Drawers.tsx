"use client";

import { useState } from "react";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const SURFACE = "var(--rz-surface)";

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden className="ml-1 inline-block">
      <path d="M13 9.012v-6H7M13.02 3 7 9.01M3 5.012v8h8.01" strokeLinejoin="round" />
    </svg>
  );
}

function ThumbsIcon({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden style={up ? undefined : { transform: "rotate(180deg)" }}>
      <path d="M9 2.871v4.13h4.12c.6 0 1.02.59.83 1.16l-1.6 4.77a1.58 1.58 0 0 1-1.49 1.07H1v-8h4l2.41-3.61c.48-.72 1.59-.38 1.59.48ZM5 14.001v-8" strokeLinejoin="round" />
    </svg>
  );
}

/** Body of the AppLayout tools ("Info") panel — mirrors the Route 53 help drawer. */
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
    <div style={{ color: SECONDARY }}>
      <p className="mb-3 text-[14px]">The details page for a hosted zone include the following information:</p>
      <ul className="flex list-disc flex-col gap-3 pl-5 text-[14px]">
        {items.map(([t, d]) => (
          <li key={t}>
            <b style={{ color: INK }}>{t}</b>: {d}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>
        Was this content helpful?
      </h3>
      <div className="mt-3 flex gap-2">
        {(["yes", "no"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setHelpful(v)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-[14px] font-bold"
            style={{
              border: `1px solid ${helpful === v ? LINK : "var(--rz-borderstrong)"}`,
              color: helpful === v ? LINK : SECONDARY,
              backgroundColor: SURFACE,
            }}
          >
            <ThumbsIcon up={v === "yes"} /> {v === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
      <hr className="my-6" style={{ borderColor: BORDER }} />
      <h3 className="text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.18px" }}>
        Learn more <ExternalIcon />
      </h3>
      <ul className="mt-3 text-[14px]">
        <li>
          <a
            href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/MigratingDNS.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: LINK }}
          >
            Making Route 53 the DNS service for an existing domain
          </a>
        </li>
      </ul>
    </div>
  );
}
