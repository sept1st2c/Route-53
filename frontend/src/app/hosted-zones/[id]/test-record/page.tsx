"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { InfoLink } from "@/components/ui/Container";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { RECORD_TYPES, type HostedZone, type DNSRecord } from "@/types";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

const TYPE_DESC: Record<string, string> = {
  A: "Routes traffic to an IPv4 address and some AWS resources",
  AAAA: "Routes traffic to an IPv6 address and some AWS resources",
  CNAME: "Routes traffic to another domain name and to some AWS resources",
  MX: "Specifies mail servers",
  TXT: "Used to verify email senders and for application-specific values",
  PTR: "Maps an IP address to a domain name",
  SRV: "Application-specific values that identify servers",
  SPF: "Not recommended. Was used to verify email senders",
  NAPTR: "Used by Dynamic Delegation Discovery System (DDDS) applications",
  CAA: "Restricts which certificate authorities can issue certificates",
  NS: "Specifies name servers for the hosted zone",
  DS: "Delegation signer record for DNSSEC",
  TLSA: "Associates a TLS certificate with a domain name",
  SSHFP: "Publishes SSH public key fingerprints",
  HTTPS: "Specifies parameters for HTTPS connections",
  SVCB: "Specifies parameters for connecting to a service",
};

const inputCls =
  "mt-1 block w-full rounded-lg bg-[var(--rz-surface)] px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]";
const inputStyle = { height: 32, border: "1px solid var(--rz-borderstrong)" } as const;

function Caret() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill={LINK} aria-hidden>
      <path d="M8 11 4 5h8l-4 6Z" />
    </svg>
  );
}

function FieldLabel({ label, optional, info }: { label?: string; optional?: boolean; info?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[14px] font-bold" style={{ color: INK }}>
        {label}
        {optional && (
          <i className="font-normal" style={{ color: MUTED }}>
            {" "}
            - <span className="italic">optional</span>
          </i>
        )}
      </label>
      {info && <InfoLink />}
    </div>
  );
}

function Card({
  title,
  optional,
  info,
  description,
  children,
}: {
  title: string;
  optional?: boolean;
  info?: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[16px] bg-[var(--rz-surface)]" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>
            {title}
            {optional && (
              <i className="font-normal" style={{ color: MUTED }}>
                {" "}
                - <span className="italic">optional</span>
              </i>
            )}
          </h2>
          {info && <InfoLink />}
        </div>
        {description && (
          <p className="mt-1 text-[14px]" style={{ color: SECONDARY }}>
            {description}
          </p>
        )}
      </div>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </section>
  );
}

type Result = { found: boolean; record?: DNSRecord };

export default function TestRecordPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [recordName, setRecordName] = useState("");
  const [type, setType] = useState("A");
  const [resolverIp, setResolverIp] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [ednsIp, setEdnsIp] = useState("");
  const [subnetMask, setSubnetMask] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    zoneService
      .get(zoneId)
      .then(setZone)
      .catch((e) => notify({ type: "error", content: apiError(e, "Failed to load hosted zone") }));
  }, [zoneId, notify]);

  const zoneName = zone?.name?.replace(/\.$/, "") ?? "…";
  const backToRecords = () => router.push(`/hosted-zones/${zoneId}/records`);

  // No real DNS query — we resolve against the records stored for this zone.
  const getResponse = async () => {
    if (!zone) return;
    setLoading(true);
    setResult(null);
    try {
      const target = recordName.trim() ? `${recordName.trim()}.${zoneName}` : zoneName;
      const norm = (s: string) => s.replace(/\.$/, "").toLowerCase();
      const data = await recordService.list(zoneId, { type, limit: 100 });
      const match = data.items.find((r) => r.type === type && norm(r.name) === norm(target));
      setResult({ found: !!match, record: match });
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to test record") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneName, href: `/hosted-zones/${zoneId}/records` },
        { label: "Test record" },
      ]}
    >
      <div className="px-7 py-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Title */}
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>Test record</h1>
          <InfoLink />
        </div>
        <p className="mb-4 text-[14px]" style={{ color: SECONDARY }}>
          Test records to simulate the values that Route 53 returns in response to DNS queries. This tool displays the
          standard values that Route 53 provides based on the settings in the hosted zone. The tool doesn&rsquo;t send
          actual DNS queries.
        </p>

        <div className="flex flex-col gap-5 pb-6">
          {/* Record to test */}
          <Card title="Record to test">
            <div className="flex flex-col gap-5">
              <div>
                <div className="text-[14px] font-bold" style={{ color: INK }}>Hosted zone</div>
                <div className="mt-0.5 text-[14px]" style={{ color: INK }}>{zoneName}</div>
              </div>

              <div>
                <FieldLabel label="Record name" optional info />
                <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                  To check a record that has the same name as the hosted zone {zoneName}, leave this field blank. To
                  check the record for a subdomain, enter the subdomain name excluding the domain name.
                </p>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }}>
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                      <path d="m11 11 4 4M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <input
                    value={recordName}
                    onChange={(e) => setRecordName(e.target.value)}
                    placeholder="www"
                    className={inputCls + " pl-9"}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <FieldLabel label="Record type" info />
                <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                  The DNS type of the record determines the format of the value that Route 53 returns in response to DNS queries.
                </p>
                <div className="relative mt-1">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="block h-8 w-full appearance-none rounded-lg bg-[var(--rz-surface)] pl-3 pr-9 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]"
                    style={{ border: "1px solid var(--rz-borderstrong)", color: INK }}
                  >
                    {RECORD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_DESC[t] ? `${t} – ${TYPE_DESC[t]}` : t}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <Caret />
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Settings to simulate DNS queries */}
          <Card
            title="Settings to simulate DNS queries"
            optional
            description="Simulate the response that Route 53 returns to a specific IP address. This is useful for testing geolocation and latency records."
          >
            <div className="flex flex-col gap-5">
              <div>
                <FieldLabel label="Resolver IP address" info />
                <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                  The IP address that the tool uses to simulate the location of the DNS resolver that a client uses to
                  make requests. If you omit this value, the tool uses the IP address of a DNS resolver in the AWS US
                  East (N. Virginia) Region.
                </p>
                <input
                  value={resolverIp}
                  onChange={(e) => setResolverIp(e.target.value)}
                  placeholder="192.0.2.25"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Additional configuration expander */}
              <div>
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className="flex items-center gap-2 text-[16px] font-bold"
                  style={{ color: INK, letterSpacing: "-0.08px" }}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden style={{ transform: moreOpen ? "none" : "rotate(-90deg)" }}>
                    <path d="M8 11 4 5h8l-4 6Z" />
                  </svg>
                  Additional configuration
                </button>

                {moreOpen && (
                  <div className="mt-3 flex flex-col gap-5">
                    <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                      If the resolver supports EDNS0, specify an IP address and subnet mask for the client.
                    </p>
                    <div>
                      <FieldLabel label="EDNS0 client subnet IP" info />
                      <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                        The client subnet IP for an IP address in the applicable location. For example, 192.0.2.0.
                      </p>
                      <input
                        value={ednsIp}
                        onChange={(e) => setEdnsIp(e.target.value)}
                        placeholder="192.0.2.0"
                        className={inputCls}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <FieldLabel label="Subnet mask" optional info />
                      <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                        The subnet mask for the <b>EDNS0 client subnet IP</b>. For example, 24.
                      </p>
                      <input
                        type="number"
                        value={subnetMask}
                        onChange={(e) => setSubnetMask(e.target.value)}
                        placeholder="24"
                        className={inputCls}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Response (after Get response) */}
          {result && (
            <Card title="Response">
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                <Detail
                  label="Response returned by Route 53"
                  value={result.found ? result.record!.value : "No record found for this name and type."}
                  mono={result.found}
                />
                <Detail label="Record type" value={type} />
                <Detail label="Response code" value={result.found ? "NOERROR" : "NXDOMAIN"} />
                <Detail label="Protocol" value="UDP" />
              </div>
            </Card>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="link" onClick={backToRecords}>Cancel</Button>
          <Button variant="primary" onClick={getResponse} disabled={loading || !zone}>
            {loading ? "Getting response…" : "Get response"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[14px] font-bold" style={{ color: INK }}>{label}</div>
      <div
        className={"mt-0.5 whitespace-pre-line break-all text-[14px]" + (mono ? " font-mono text-[13px]" : "")}
        style={{ color: INK }}
      >
        {value}
      </div>
    </div>
  );
}
