"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { InfoLink } from "@/components/ui/Container";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { HostedZone, RecordType } from "@/types";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

const TYPE_OPTIONS: [RecordType, string][] = [
  ["A", "A – Routes traffic to an IPv4 address and some AWS resources"],
  ["AAAA", "AAAA – Routes traffic to an IPv6 address and some AWS resources"],
  ["CNAME", "CNAME – Routes traffic to another domain name and to some AWS resources"],
  ["MX", "MX – Specifies mail servers"],
  ["TXT", "TXT – Used to verify email senders and for application-specific values"],
  ["PTR", "PTR – Maps an IP address to a domain name"],
  ["SRV", "SRV – Application-specific values that identify servers"],
  ["SPF", "SPF – Not recommended"],
  ["NAPTR", "NAPTR – Used by DDDS applications"],
  ["CAA", "CAA – Restricts CAs that can create SSL/TLS certificates for the domain"],
  ["NS", "NS – Name servers for a hosted zone"],
  ["DS", "DS – Delegation Signer, used to establish a chain of trust for DNSSEC"],
  ["TLSA", "TLSA – Associates a TLS server certificate or public key with the domain name. DNSSEC required."],
  ["SSHFP", "SSHFP – Specifies the SSH key fingerprint and algorithm. DNSSEC required."],
  ["HTTPS", "HTTPS – Provides connection optimization details like protocols, ports, and endpoints for efficient client-service communication."],
  ["SVCB", "SVCB – Delivers extensible configuration information for accessing service endpoints."],
];

const VALUE_PLACEHOLDER: Partial<Record<RecordType, string>> = {
  A: "192.0.2.235",
  AAAA: "2001:db8::1",
  CNAME: "example.com",
  MX: "10 mail.example.com",
  TXT: '"v=spf1 -all"',
  PTR: "example.com",
  SRV: "1 10 5269 server.example.com",
  SPF: '"v=spf1 ip4:192.0.2.0/24 -all"',
  NAPTR: '100 10 "U" "E2U+sip" "!^.*$!sip:info@example.com!" .',
  CAA: '0 issue "letsencrypt.org"',
  NS: "ns-1.example.com",
  DS: "12345 13 2 1F987CC6...",
  TLSA: "3 1 1 0123456789ABCDEF...",
  SSHFP: "2 1 123456789ABCDEF...",
  HTTPS: '1 . alpn="h2"',
  SVCB: '1 . alpn="h2"',
};

type Block = { key: number; sub: string; type: RecordType; value: string; ttl: string; alias: boolean };

let counter = 1;
const newBlock = (): Block => ({ key: counter++, sub: "", type: "A", value: "", ttl: "300", alias: false });

export default function CreateRecordPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([newBlock()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  const recordsHref = `/hosted-zones/${zoneId}/records`;
  const zoneNoDot = (zone?.name ?? "").replace(/\.$/, "");

  const load = useCallback(async () => {
    try {
      setZone(await zoneService.get(zoneId));
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load hosted zone") });
    }
  }, [zoneId, notify]);
  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: number, patch: Partial<Block>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBlock = () => setBlocks((bs) => [...bs, newBlock()]);
  const removeBlock = (key: number) => setBlocks((bs) => (bs.length > 1 ? bs.filter((b) => b.key !== key) : bs));

  const submit = async () => {
    setError("");
    for (const b of blocks) {
      if (!b.value.trim()) {
        setError("Enter a value for every record.");
        return;
      }
    }
    setSaving(true);
    try {
      for (const b of blocks) {
        const name = b.sub.trim() ? `${b.sub.trim()}.${zoneNoDot}` : zoneNoDot;
        await recordService.create(zoneId, {
          name,
          type: b.type,
          value: b.value.trim(),
          ttl: Number(b.ttl) || 300,
          routing_policy: "Simple",
        });
      }
      notify({ type: "success", content: `Created ${blocks.length} record${blocks.length > 1 ? "s" : ""}.` });
      router.push(recordsHref);
    } catch (e) {
      setError(apiError(e, "Failed to create record"));
      setSaving(false);
    }
  };

  const inputCls = "h-8 rounded-lg bg-[var(--rz-surface)] px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]";
  const labelRow = (text: string) => (
    <div className="mb-1 flex items-center gap-2">
      <label className="text-[14px] font-bold" style={{ color: INK }}>{text}</label>
      <InfoLink />
    </div>
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneNoDot || "…", href: recordsHref },
        { label: "Create record" },
      ]}
    >
      <div className="px-7 py-4" style={{ fontFamily: FONT, color: INK }}>
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>Create record</h1>
          <InfoLink />
        </div>

        {/* Quick create card */}
        <section className="rounded-[16px] bg-[var(--rz-surface)]" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <h2 className="text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>Quick create record</h2>
            <button className="text-[14px] font-bold" style={{ color: LINK }}>Switch to wizard</button>
          </div>

          <div className="flex flex-col gap-4 px-5 pb-5">
            {blocks.map((b, i) => (
              <div key={b.key} className={i > 0 ? "border-t pt-4" : ""} style={{ borderColor: BORDER }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[16px] font-bold">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill={INK} aria-hidden><path d="M8 11 4 5h8l-4 6Z" /></svg>
                    Record {i + 1}
                  </span>
                  <Button disabled={blocks.length === 1} onClick={() => removeBlock(b.key)}>Delete</Button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Record name */}
                  <div>
                    {labelRow("Record name")}
                    <div className="flex items-center gap-2">
                      <input
                        value={b.sub}
                        onChange={(e) => setField(b.key, { sub: e.target.value })}
                        placeholder="subdomain"
                        className={inputCls + " w-full max-w-[380px] italic"}
                        style={{ border: "1px solid var(--rz-borderstrong)", fontStyle: b.sub ? "normal" : "italic" }}
                      />
                      <span className="text-[14px]" style={{ color: INK }}>{zoneNoDot}</span>
                    </div>
                    <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>Keep blank to create a record for the root domain.</p>
                    {/* Alias toggle (cosmetic) */}
                    <button
                      type="button"
                      onClick={() => setField(b.key, { alias: !b.alias })}
                      className="mt-3 flex items-center gap-2 text-[14px]"
                    >
                      <span className="relative inline-block h-4 w-6 rounded-full transition-colors" style={{ backgroundColor: b.alias ? LINK : "var(--rz-secondary)" }}>
                        <span className="absolute top-0.5 h-3 w-3 rounded-full bg-[var(--rz-surface)] transition-all" style={{ left: b.alias ? 10 : 2 }} />
                      </span>
                      Alias
                    </button>
                  </div>

                  {/* Record type */}
                  <div>
                    {labelRow("Record type")}
                    <select
                      value={b.type}
                      onChange={(e) => setField(b.key, { type: e.target.value as RecordType })}
                      className={inputCls + " w-full"}
                      style={{ border: "1px solid var(--rz-borderstrong)" }}
                    >
                      {TYPE_OPTIONS.map(([t, label]) => <option key={t} value={t}>{label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Value */}
                <div className="mt-4">
                  {labelRow("Value")}
                  <textarea
                    value={b.value}
                    onChange={(e) => setField(b.key, { value: e.target.value })}
                    rows={3}
                    placeholder={VALUE_PLACEHOLDER[b.type]}
                    className="w-full resize-y rounded-lg bg-[var(--rz-surface)] px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]"
                    style={{ border: "1px solid var(--rz-borderstrong)", minHeight: 80 }}
                  />
                  <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>Enter multiple values on separate lines.</p>
                </div>

                {/* TTL + Routing policy */}
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    {labelRow("TTL (seconds)")}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={b.ttl}
                        onChange={(e) => setField(b.key, { ttl: e.target.value })}
                        className={inputCls + " flex-1"}
                        style={{ border: "1px solid var(--rz-borderstrong)" }}
                      />
                      {([["1m", "60"], ["1h", "3600"], ["1d", "86400"]] as const).map(([lbl, v]) => (
                        <button key={lbl} onClick={() => setField(b.key, { ttl: v })} className="h-8 rounded-full px-3 text-[14px] font-bold" style={{ border: `1px solid ${LINK}`, color: LINK }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>Recommended values: 60 to 172800 (two days)</p>
                  </div>
                  <div>
                    {labelRow("Routing policy")}
                    <select className={inputCls + " w-full"} style={{ border: "1px solid var(--rz-borderstrong)" }} defaultValue="Simple">
                      <option value="Simple">Simple routing</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}

            {error && <p className="text-[12px]" style={{ color: "#d91515" }}>{error}</p>}
          </div>

          <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: BORDER }}>
            <Button onClick={addBlock}>Add another record</Button>
          </div>
        </section>

        {/* Footer actions */}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="link" onClick={() => router.push(recordsHref)} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create records"}
          </Button>
        </div>

        {/* View existing records (collapsible) */}
        <div className="mt-5">
          <button onClick={() => setShowExisting((o) => !o)} className="flex items-center gap-1 text-[16px] font-bold">
            <svg viewBox="0 0 16 16" width="16" height="16" fill={INK} aria-hidden style={{ transform: showExisting ? "none" : "rotate(-90deg)" }}><path d="M8 11 4 5h8l-4 6Z" /></svg>
            View existing records
          </button>
          <p className="mt-1 text-[14px]" style={{ color: SECONDARY }}>
            The following table lists the existing records in {zoneNoDot}.
          </p>
          {showExisting && <ExistingRecords zoneId={zoneId} />}
        </div>
      </div>
    </AppShell>
  );
}

function ExistingRecords({ zoneId }: { zoneId: number }) {
  const [items, setItems] = useState<{ name: string; type: string }[]>([]);
  useEffect(() => {
    recordService.list(zoneId, { limit: 100 }).then((d) => setItems(d.items.map((r) => ({ name: r.name, type: r.type })))).catch(() => {});
  }, [zoneId]);
  return (
    <div className="mt-3 rounded-[16px] bg-[var(--rz-surface)]" style={{ border: `1px solid ${BORDER}` }}>
      <table className="w-full text-[14px]">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left font-bold" style={{ color: SECONDARY, borderBottom: `1px solid ${BORDER}` }}>Record name</th>
            <th className="px-4 py-2 text-left font-bold" style={{ color: SECONDARY, borderBottom: `1px solid ${BORDER}` }}>Type</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.name}</td>
              <td className="px-4 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
