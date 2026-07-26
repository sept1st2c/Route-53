"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Container, InfoLink } from "@/components/ui/Container";
import { zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { HostedZone } from "@/types";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

function Caret({ dir = "down" }: { dir?: "down" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden style={{ transform: dir === "right" ? "rotate(-90deg)" : "none" }}>
      <path d="M8 11 4 5h8l-4 6Z" />
    </svg>
  );
}

export default function QueryLoggingPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [permsOpen, setPermsOpen] = useState(false);

  useEffect(() => {
    zoneService
      .get(zoneId)
      .then(setZone)
      .catch((e) => notify({ type: "error", content: apiError(e, "Failed to load hosted zone") }));
  }, [zoneId, notify]);

  const zoneName = zone?.name?.replace(/\.$/, "") ?? "…";
  const backToRecords = () => router.push(`/hosted-zones/${zoneId}/records`);

  // CloudWatch Logs is a separate service and out of scope — this page is UI only.
  const onCreate = () => {
    notify({ type: "info", content: "Query logging uses Amazon CloudWatch Logs, which isn't available in this clone." });
    backToRecords();
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneName },
      ]}
    >
      <div className="px-7 py-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Title */}
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>Configure query logging</h1>
          <InfoLink />
        </div>
        <p className="mb-4 text-[14px]" style={{ color: SECONDARY }}>
          You can configure Amazon Route 53 to log information about the queries that Route 53 receives, such as the
          domain or subdomain that was requested, the date and time of the query, and the DNS record type (such as A or AAAA).
        </p>

        <div className="flex flex-col gap-5 pb-6">
          {/* Log group card */}
          <Container
            title="Log group"
            info
            description="Specify the CloudWatch Logs log group where you want Route 53 to save DNS queries for records in this hosted zone."
          >
            <div>
              <div className="text-[14px] font-bold" style={{ color: INK }}>Log group</div>
              <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                You can choose the name of an existing log group or choose to create a new log group.
              </p>
              <div className="mt-1 flex items-center gap-3">
                {/* Disabled select — CloudWatch log groups are out of scope (UI only) */}
                <button
                  type="button"
                  disabled
                  className="flex h-8 max-w-[66%] flex-1 items-center justify-between rounded-lg px-3 text-[14px]"
                  style={{ border: "1px solid var(--rz-borderstrong)", color: MUTED, background: "var(--rz-surface)", cursor: "not-allowed" }}
                >
                  <span className="truncate">/aws/route53/example.com</span>
                  <span style={{ color: LINK }}><Caret /></span>
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Refresh log groups"
                  className="flex h-8 w-8 items-center justify-center"
                  style={{ color: LINK, cursor: "not-allowed" }}
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                    <path d="M15 0v5l-5-.04" strokeLinejoin="round" />
                    <path d="M15 8c0 3.87-3.13 7-7 7s-7-3.13-7-7 3.13-7 7-7c2.79 0 5.2 1.63 6.33 4" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>
                The log group can have up to 512 characters. Valid characters: a-z, A-Z, 0-9, and . _ / # - (hyphen)
              </p>
            </div>
          </Container>

          {/* Missing permission warning */}
          <div
            className="flex items-start justify-between gap-4 rounded-[12px] px-4 py-2.5"
            style={{ backgroundColor: "#fffef0", border: "1.78px solid #855900" }}
          >
            <div className="flex gap-2">
              <span className="mt-0.5 shrink-0" style={{ color: "#855900" }}>
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <path d="M8 5v4M8 10v2M6.52 1.88l-5.33 9.76c-.13.23-.19.5-.19.76 0 .88.71 1.59 1.59 1.59H13.4c.88 0 1.59-.71 1.59-1.59 0-.27-.07-.53-.19-.76L9.48 1.88C9.18 1.34 8.62 1 8 1s-1.18.34-1.48.88Z" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="text-[14px]" style={{ color: INK }}>
                <div className="font-bold">Missing permission</div>
                <p className="mt-0.5">
                  Route 53 needs permission from a resource policy to publish logs to a CloudWatch Logs log group. No
                  existing resource policies grant the required permissions.
                </p>
                <span className="mt-1 inline-flex items-center gap-1 text-[14px] font-bold" style={{ color: INK, cursor: "default" }}>
                  <Caret dir="right" /> Details
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="shrink-0 rounded-full px-5 py-1 text-[14px] font-bold"
              style={{ color: "#8c8c94", border: "1.78px solid #b4b4bb", cursor: "not-allowed", whiteSpace: "nowrap" }}
            >
              Grant permissions
            </button>
          </div>

          {/* Permissions - optional (expander, UI only) */}
          <div>
            <button
              type="button"
              onClick={() => setPermsOpen((o) => !o)}
              className="flex items-center gap-2 text-[16px] font-bold"
              style={{ color: INK, letterSpacing: "-0.08px" }}
            >
              <Caret dir={permsOpen ? "down" : "right"} />
              Permissions <span style={{ color: MUTED, fontWeight: 400 }}>- optional</span>
            </button>

            {permsOpen && (
              <section className="mt-3 rounded-[16px] bg-[var(--rz-surface)]" style={{ border: `1px solid ${BORDER}` }}>
                <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>
                      Edit or delete a CloudWatch Logs resource policy <span style={{ color: MUTED, fontWeight: 400 }}>(0)</span>
                    </h2>
                    <InfoLink />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled>Edit</Button>
                    <Button disabled>Delete</Button>
                  </div>
                </div>
                <p className="px-5 pb-2 text-[14px]" style={{ color: SECONDARY }}>
                  If you delete one of the following resource policies and choose Grant permission, Route 53 creates a
                  resource policy that grants permission to publish logs to any log group. You can also edit an existing
                  resource policy.
                </p>
                <div className="overflow-x-auto px-5 pb-4">
                  <table className="w-full border-collapse text-[14px]">
                    <thead>
                      <tr>
                        {["Policy name", "Last updated time", "Matches log group", "Grants permission"].map((c) => (
                          <th key={c} className="whitespace-nowrap px-2 py-2 text-left font-bold" style={{ color: SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <b style={{ color: INK }}>No resource policies found.</b>
                    <button type="button" disabled className="text-[14px] font-bold" style={{ color: LINK, cursor: "not-allowed" }}>
                      Grant permission
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="link" onClick={backToRecords}>Cancel</Button>
          <Button variant="primary" onClick={onCreate}>Create</Button>
        </div>
      </div>
    </AppShell>
  );
}
