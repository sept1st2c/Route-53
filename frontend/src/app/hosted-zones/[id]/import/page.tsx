"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Container, InfoLink } from "@/components/ui/Container";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { HostedZone } from "@/types";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const BORDER = "var(--rz-border)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';
const PAGE = 10;

const display = (name: string) => name.replace(/\.$/, "");

type PreviewRow = { name: string; type: string; ttl: number; value: string };

const CLASSES = new Set(["IN", "CH", "HS", "CS"]);

/** Lightweight BIND parser for the live preview — mirrors the backend parser. */
function parsePreview(text: string, zoneName: string): PreviewRow[] {
  let origin = zoneName.endsWith(".") ? zoneName : zoneName + ".";
  let ttlDefault = 300;
  let lastName = origin;
  const grouped = new Map<string, PreviewRow & { values: string[] }>();
  const order: string[] = [];
  const qualify = (n: string) => (n === "@" ? origin : n.endsWith(".") ? n : `${n}.${origin}`);

  for (const raw of text.split(/\r?\n/)) {
    // strip comments outside quotes
    let line = "";
    let inQ = false;
    for (const ch of raw) {
      if (ch === '"') inQ = !inQ;
      if (ch === ";" && !inQ) break;
      line += ch;
    }
    if (!line.trim()) continue;

    const trimmed = line.trim();
    if (/^\$ORIGIN/i.test(trimmed)) {
      const p = trimmed.split(/\s+/);
      if (p[1]) origin = p[1].endsWith(".") ? p[1] : p[1] + ".";
      continue;
    }
    if (/^\$TTL/i.test(trimmed)) {
      const p = trimmed.split(/\s+/);
      if (/^\d+$/.test(p[1] || "")) ttlDefault = +p[1];
      continue;
    }

    const startsWS = /^\s/.test(raw);
    const toks = trimmed.split(/\s+/);
    let name = startsWS ? lastName : qualify(toks.shift() || "@");
    lastName = name;

    let ttl = ttlDefault;
    while (toks.length && (/^\d+$/.test(toks[0]) || CLASSES.has(toks[0].toUpperCase()))) {
      const t = toks.shift() as string;
      if (/^\d+$/.test(t)) ttl = +t;
    }
    if (!toks.length) continue;
    const type = (toks.shift() as string).toUpperCase();
    const value = toks.join(" ").trim();
    if (!value) continue;

    const key = `${name}|${type}`;
    if (!grouped.has(key)) {
      grouped.set(key, { name, type, ttl, value: "", values: [] });
      order.push(key);
    }
    const g = grouped.get(key)!;
    g.values.push(value);
    g.ttl = Math.min(g.ttl, ttl);
  }

  return order.map((k) => {
    const g = grouped.get(k)!;
    return { name: g.name, type: g.type, ttl: g.ttl, value: g.values.join("\n") };
  });
}

export default function ImportZonePage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);

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

  const zoneName = zone?.name ?? "";
  const recordsHref = `/hosted-zones/${zoneId}/records`;

  const preview = useMemo(() => (zoneName ? parsePreview(text, zoneName) : []), [text, zoneName]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return preview;
    return preview.filter(
      (r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
  }, [preview, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => { if (page > pages) setPage(1); }, [page, pages]);

  const doImport = async () => {
    if (!text.trim()) {
      notify({ type: "error", content: "Paste a zone file to import." });
      return;
    }
    setImporting(true);
    try {
      const res = await recordService.importZone(zoneId, text);
      const parts = [`${res.created} created`, `${res.updated} updated`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      notify({ type: "success", content: `Zone file imported — ${parts.join(", ")}.` });
      router.push(recordsHref);
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to import zone file") });
      setImporting(false);
    }
  };

  const COLS = ["Record name", "Type", "Value/Route traffic to", "TTL (seconds)"];

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: display(zoneName) || "…", href: recordsHref },
        { label: "Import zone file" },
      ]}
    >
      <div className="px-7 py-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Title */}
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>
            Import zone file
          </h1>
          <InfoLink />
        </div>
        <p className="mb-5 text-[14px]" style={{ color: SECONDARY }}>
          You can create records for a Route 53 hosted zone by importing a zone file.
        </p>

        <div className="flex flex-col gap-5 pb-6">
          {/* Zone file */}
          <Container title="Zone file" description="Paste the contents of your zone file below.">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={"subdomain1 0s A 10.0.0.0\nsubdomain2 0s CNAME example.com."}
              className="block w-full resize-y rounded-lg px-3 py-1.5 font-mono text-[13px] leading-5 focus:outline-none focus:ring-2 focus:ring-[#006ce0]"
              style={{ border: "1px solid var(--rz-borderstrong)", backgroundColor: "var(--rz-surface)", color: INK, minHeight: 212 }}
            />
            <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>
              If the hosted zone already contains records that appear in the zone file, the import
              process fails, and no records are created. Enter multiple records on separate lines.
            </p>
          </Container>

          {/* Record preview */}
          <Container
            title={`Record preview for ${display(zoneName)} (${preview.length})`}
            description="Route 53 creates the following records when you choose Import zone file. If you edit the contents of the zone file above, the table reflects your changes."
          >
            {/* filter + pagination */}
            <div className="flex flex-wrap items-center gap-3 pb-2">
              <div className="relative min-w-[280px] flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }}>
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                    <path d="m11 11 4 4M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" strokeLinejoin="round" />
                  </svg>
                </span>
                <input
                  value={filter}
                  onChange={(e) => { setPage(1); setFilter(e.target.value); }}
                  placeholder="Filter records by property or value"
                  className="h-8 w-full rounded-lg pl-9 pr-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#006ce0]"
                  style={{ border: "1px solid var(--rz-borderstrong)", backgroundColor: "var(--rz-surface)", color: INK }}
                />
              </div>
              <div className="flex items-center gap-1" style={{ color: SECONDARY }}>
                <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1 disabled:opacity-40">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M11 2 5 8l6 6" strokeLinejoin="round" /></svg>
                </button>
                <span className="min-w-5 text-center text-[14px] font-bold">{page}</span>
                <button aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="p-1 disabled:opacity-40">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="m5 2 6 6-6 6" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th key={c} className="whitespace-nowrap px-2 py-2 text-left align-middle font-bold" style={{ color: SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={`${r.name}-${r.type}-${i}`} className="align-top">
                      <td className="px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{display(r.name)}</td>
                      <td className="px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.type}</td>
                      <td className="px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)", maxWidth: 360 }}>
                        {r.value.split("\n").map((v, j) => (
                          <div key={j} className="overflow-hidden text-ellipsis whitespace-nowrap" title={v}>{v}</div>
                        ))}
                      </td>
                      <td className="px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.ttl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="px-2 py-4 text-[14px]" style={{ color: MUTED }}>
                  This table displays records based on the contents of your zone file.
                </p>
              )}
            </div>
          </Container>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="link" onClick={() => router.push(recordsHref)} disabled={importing}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doImport} disabled={importing}>
            {importing ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
