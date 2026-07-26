"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useResizableColumns, ResizeHandle } from "@/components/ui/ResizableColumns";
import { RecordForm } from "@/components/records/RecordForm";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { useDrawer } from "@/context/DrawerContext";
import { useHotkey } from "@/lib/useHotkey";
import { RECORD_TYPES, type DNSRecord, type HostedZone } from "@/types";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';
const LIMIT = 10;

type Tab = "records" | "recovery" | "dnssec" | "tags";

const COLS = [
  "Record name",
  "Type",
  "Routing policy",
  "Differentiator",
  "Alias",
  "Value/Route traffic to",
  "TTL (seconds)",
  "Health check ID",
  "Evaluate target health",
  "Record ID",
];
const COL_DEFAULTS = [200, 80, 120, 120, 80, 240, 110, 130, 170, 110];
const CHECKBOX_W = 44;

function Caret() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--rz-borderstrong)" aria-hidden className="ml-1 inline-block">
      <path d="M8 11 4 5h8l-4 6Z" />
    </svg>
  );
}

export default function RecordsPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [routingFilter, setRoutingFilter] = useState("");
  const [aliasFilter, setAliasFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<Tab>("records");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { widths, total: tableWidth, startResize } = useResizableColumns(COL_DEFAULTS);

  useHotkey("c", () => router.push(`/hosted-zones/${zoneId}/records/create`));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DNSRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteZoneOpen, setDeleteZoneOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "bind">("bind");
  const [exporting, setExporting] = useState(false);

  const loadZone = useCallback(async () => {
    try {
      setZone(await zoneService.get(zoneId));
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load hosted zone") });
    }
  }, [zoneId, notify]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recordService.list(zoneId, { search, type: typeFilter, page, limit: LIMIT });
      setRecords(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setSelected(new Set());
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load records") });
    } finally {
      setLoading(false);
    }
  }, [zoneId, search, typeFilter, page, notify]);

  useEffect(() => {
    loadZone();
  }, [loadZone]);
  useEffect(() => {
    const t = setTimeout(loadRecords, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadRecords, search]);

  // The default zone-apex NS and SOA records are managed by Route 53 and can't be deleted.
  const isProtected = (r: DNSRecord) => r.type === "SOA" || (r.type === "NS" && r.name === zone?.name);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  // Type is filtered server-side; Routing policy & Alias refine the loaded page client-side.
  // (Every record in this clone is non-alias, so "Alias" → none and "Non-alias" → all.)
  const displayed = records.filter(
    (r) =>
      (!routingFilter || (r.routing_policy || "Simple") === routingFilter) &&
      (!aliasFilter || aliasFilter === "Non-alias")
  );

  const activeFilters = [
    typeFilter && { key: "type", label: `Type = ${typeFilter}`, clear: () => { setPage(1); setTypeFilter(""); } },
    routingFilter && { key: "routing", label: `Routing policy = ${routingFilter}`, clear: () => { setPage(1); setRoutingFilter(""); } },
    aliasFilter && { key: "alias", label: `Alias = ${aliasFilter === "Alias" ? "Yes" : "No"}`, clear: () => { setPage(1); setAliasFilter(""); } },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAllFilters = () => { setPage(1); setTypeFilter(""); setRoutingFilter(""); setAliasFilter(""); };

  const toggleAll = () =>
    setSelected((s) => (displayed.length > 0 && displayed.every((r) => s.has(r.id)) ? new Set() : new Set(displayed.map((r) => r.id))));

  const selectedRecords = displayed.filter((r) => selected.has(r.id));
  const one = selectedRecords.length === 1 ? selectedRecords[0] : null;
  const selectionHasProtected = selectedRecords.some(isProtected);

  // Feed the split panel: one record → its details, otherwise the selection count.
  const { setSplitData } = useDrawer();
  const selCount = selectedRecords.length;
  const oneId = one?.id ?? null;
  useEffect(() => {
    setSplitData({
      count: selCount,
      noun: "record",
      detailTitle: "Record details",
      detail: one ? <RecordSplitDetail record={one} onEdit={() => { setEditing(one); setFormOpen(true); }} /> : null,
    });
    // `one` is derived from oneId; excluded to avoid a re-render loop on its changing identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCount, oneId, setSplitData]);

  const refreshAll = () => {
    loadZone();
    loadRecords();
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await recordService.bulkRemove(zoneId, selectedRecords.map((r) => r.id));
      notify({ type: "success", content: `Deleted ${selectedRecords.length} record${selectedRecords.length > 1 ? "s" : ""}.` });
      setDeleteOpen(false);
      refreshAll();
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to delete records") });
    } finally {
      setDeleting(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const { data, filename } = await zoneService.export(zoneId, exportFormat);
      const blob = new Blob([data], { type: exportFormat === "json" ? "application/json" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify({ type: "success", content: `Exported ${filename}.` });
      setExportOpen(false);
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to export hosted zone") });
    } finally {
      setExporting(false);
    }
  };

  const doDeleteZone = async () => {
    try {
      await zoneService.remove(zoneId);
      notify({ type: "success", content: `Hosted zone ${zone?.name} deleted.` });
      router.push("/hosted-zones");
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to delete hosted zone") });
    }
  };

  const nsValues = records.find((r) => r.type === "NS")?.value.split("\n").map((v) => v.replace(/\.$/, "")) ?? [];
  const zoneName = zone?.name ?? "";

  const tabs: { key: Tab; label: string }[] = [
    { key: "records", label: `Records (${total})` },
    { key: "recovery", label: "Accelerated recovery" },
    { key: "dnssec", label: "DNSSEC signing" },
    { key: "tags", label: "Hosted zone tags (0)" },
  ];

  const card = "rounded-[16px] bg-[var(--rz-surface)]";
  const cardStyle = { border: `1px solid ${BORDER}` };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneName.replace(/\.$/, "") || "…" },
      ]}
    >
      <div className="px-7 py-4" style={{ fontFamily: FONT, color: INK }}>
        {/* Page header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>
            {zone && (
              <span className="rounded px-2 text-[12px] font-normal leading-5" style={{ backgroundColor: LINK, color: "#fff" }}>
                {zone.type}
              </span>
            )}
            {zoneName.replace(/\.$/, "")}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDeleteZoneOpen(true)}>Delete zone</Button>
            <Button onClick={() => router.push(`/hosted-zones/${zoneId}/test-record`)}>Test record</Button>
            <Button onClick={() => router.push(`/hosted-zones/${zoneId}/query-logging`)}>Configure query logging</Button>
          </div>
        </div>

        {/* Hosted zone details */}
        <section className={card + " mb-5"} style={cardStyle}>
          <div className="flex items-center justify-between px-5 py-3">
            <button onClick={() => setDetailsOpen((o) => !o)} className="flex items-center gap-2 text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>
              <svg viewBox="0 0 16 16" width="18" height="18" fill={INK} aria-hidden style={{ transform: detailsOpen ? "none" : "rotate(-90deg)" }}>
                <path d="M8 11 4 5h8l-4 6Z" />
              </svg>
              Hosted zone details
            </button>
            <Button onClick={() => router.push(`/hosted-zones/${zoneId}/edit`)}>Edit hosted zone</Button>
          </div>
          {detailsOpen && zone && (
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-5 pb-5 md:grid-cols-3">
              <Detail label="Hosted zone name" value={zoneName} />
              <Detail label="Query log" value="-" />
              <Detail label="Name servers" value={nsValues.length ? nsValues.join("\n") : "-"} mono />
              <Detail label="Hosted zone ID" value={zone.zone_id} mono />
              <Detail label="Type" value={zone.type === "Public" ? "Public hosted zone" : "Private hosted zone"} />
              <div className="hidden md:block" />
              <Detail label="Description" value={zone.comment || "-"} />
              <Detail label="Record count" value={String(zone.record_count)} />
            </div>
          )}
        </section>

        {/* Tabs */}
        <div className="flex gap-1 border-b" style={{ borderColor: BORDER }}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="relative px-3 py-3 text-[14px]"
                style={{ color: active ? INK : SECONDARY, fontWeight: active ? 700 : 400 }}
              >
                {t.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-1 rounded-full" style={{ backgroundColor: LINK }} />}
              </button>
            );
          })}
        </div>

        {tab === "records" && (
          <section className={card + " mt-5"} style={cardStyle}>
            {/* toolbar */}
            <div className="px-5 pb-3 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>
                  Records <span style={{ color: MUTED, fontWeight: 400 }}>({total})</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button iconOnly aria-label="Refresh records" onClick={refreshAll}>
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                      <path d="M15 0v5l-5-.04" strokeLinejoin="round" />
                      <path d="M15 8c0 3.87-3.13 7-7 7s-7-3.13-7-7 3.13-7 7-7c2.79 0 5.2 1.63 6.33 4" />
                    </svg>
                  </Button>
                  <Button disabled={!one} onClick={() => { if (one) { setEditing(one); setFormOpen(true); } }}>
                    Edit record
                  </Button>
                  <Button
                    disabled={selectedRecords.length === 0 || selectionHasProtected}
                    title={selectionHasProtected ? "The default NS and SOA records cannot be deleted." : undefined}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete record
                  </Button>
                  <Button onClick={() => router.push(`/hosted-zones/${zoneId}/import`)}>Import zone file</Button>
                  <Button onClick={() => setExportOpen(true)}>Export zone file</Button>
                  <Button variant="primary" onClick={() => router.push(`/hosted-zones/${zoneId}/records/create`)}>
                    Create record
                  </Button>
                </div>
              </div>
              <p className="pt-2 text-[14px]" style={{ color: SECONDARY }}>
                Automatic mode is the current search behavior optimized for best filter results.{" "}
                <button style={{ color: LINK, textDecoration: "underline" }}>To change modes go to settings.</button>
              </p>

              {/* filter row: search + Type / Routing policy / Alias dropdowns + pagination + preferences */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="relative min-w-[260px] flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }}>
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                      <path d="m11 11 4 4M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <input
                    id="page-filter-input"
                    value={search}
                    onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                    placeholder="Filter records by property or value"
                    className="h-8 w-full rounded-lg bg-[var(--rz-surface)] pl-9 pr-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]"
                    style={{ border: "1px solid var(--rz-borderstrong)" }}
                  />
                </div>
                <FilterPill
                  value={typeFilter}
                  onChange={(v) => { setPage(1); setTypeFilter(v); }}
                  placeholder="Type"
                  width={92}
                  options={[...RECORD_TYPES]}
                />
                <FilterPill
                  value={routingFilter}
                  onChange={(v) => { setPage(1); setRoutingFilter(v); }}
                  placeholder="Routing policy"
                  width={150}
                  options={["Simple", "Weighted", "Latency", "Failover", "Geolocation"]}
                />
                <FilterPill
                  value={aliasFilter}
                  onChange={(v) => { setPage(1); setAliasFilter(v); }}
                  placeholder="Alias"
                  width={108}
                  options={["Alias", "Non-alias"]}
                />
                <div className="flex items-center gap-1" style={{ color: SECONDARY }}>
                  <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1 disabled:opacity-40">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M11 2 5 8l6 6" strokeLinejoin="round" /></svg>
                  </button>
                  <span className="min-w-5 text-center text-[14px] font-bold">{page}</span>
                  <button aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="p-1 disabled:opacity-40">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="m5 2 6 6-6 6" strokeLinejoin="round" /></svg>
                  </button>
                  <button aria-label="Preferences" className="ml-1 p-1">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                      <path d="M6.11 1.729c.07-.42.44-.729.86-.729h2.02c.43 0 .79.31.86.729l.17.999c.05.29.24.529.5.679.06.03.11.06.17.1.25.15.56.2.84.1l.95-.35c.4-.15.85 0 1.07.38l1.01 1.747c.21.37.13.839-.2 1.108l-.78.64c-.23.189-.34.479-.33.768v.2c0 .29.11.579.33.769l.78.639c.33.27.42.739.2 1.108l-1.01 1.748c-.21.37-.66.529-1.06.38l-.95-.35a.966.966 0 0 0-.84.1c-.06.03-.11.07-.17.1-.26.14-.45.389-.5.679l-.17.998A.878.878 0 0 1 9 15H6.98a.87.87 0 0 1-.86-.729l-.17-.998a.988.988 0 0 0-.5-.68c-.06-.03-.11-.06-.17-.1a.996.996 0 0 0-.84-.1l-.95.35c-.4.15-.85 0-1.06-.38l-1.01-1.747a.873.873 0 0 1 .2-1.108l.78-.64c.23-.189.34-.479.33-.768v-.2c0-.3-.11-.579-.33-.769l-.78-.639a.861.861 0 0 1-.2-1.108l1.01-1.748c.21-.37.66-.529 1.07-.38l.95.35c.28.1.58.06.84-.1.06-.03.11-.07.17-.1.26-.14.45-.379.5-.678l.15-1Z" strokeLinejoin="round" />
                      <path d="M10 8c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2Z" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* applied-filter tokens — each removable, joined with "and", + Clear filters + match count */}
              {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  {activeFilters.map((f, i) => (
                    <div key={f.key} className="flex items-center gap-2">
                      {i > 0 && <span className="text-[13px]" style={{ color: MUTED }}>and</span>}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md py-1 pl-2.5 pr-1 text-[13px]"
                        style={{ background: "var(--rz-selected)", border: "1px solid var(--rz-border)", color: INK }}
                      >
                        {f.label}
                        <button
                          onClick={f.clear}
                          aria-label={`Remove filter: ${f.label}`}
                          className="flex h-[18px] w-[18px] items-center justify-center rounded-sm hover:bg-[#e1e4e6]"
                          style={{ color: SECONDARY }}
                        >
                          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                            <path d="m3 3 10 10M13 3 3 13" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    </div>
                  ))}
                  <button onClick={clearAllFilters} className="text-[14px]" style={{ color: LINK }}>
                    Clear filters
                  </button>
                  <span className="ml-auto text-[13px]" style={{ color: MUTED }}>
                    {displayed.length} {displayed.length === 1 ? "match" : "matches"}
                  </span>
                </div>
              )}
            </div>

            {/* table */}
            <div className="overflow-x-auto px-5 pb-4">
              <table className="border-collapse text-[14px]" style={{ tableLayout: "fixed", width: tableWidth + CHECKBOX_W }}>
                <colgroup>
                  <col style={{ width: CHECKBOX_W }} />
                  {widths.map((w, i) => (
                    <col key={i} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left align-middle" style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <input type="checkbox" aria-label="Select all" checked={displayed.length > 0 && displayed.every((r) => selected.has(r.id))} onChange={toggleAll} className="h-3.5 w-3.5" style={{ accentColor: LINK }} />
                    </th>
                    {COLS.map((c, i) => (
                      <th key={c} className="relative px-2 py-2 text-left align-middle font-bold" style={{ color: SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                        <span className="flex items-center overflow-hidden">
                          <span className="truncate">{c}</span>
                          <Caret />
                        </span>
                        {i < COLS.length - 1 && <ResizeHandle onMouseDown={(e) => startResize(i, e)} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-[var(--rz-hover)]">
                      <td className="px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.name}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="mt-0.5 h-3.5 w-3.5"
                          style={{ accentColor: LINK }}
                        />
                      </td>
                      <td className="truncate px-2 py-2" title={r.name} style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.name}</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.type}</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.routing_policy || "Simple"}</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)", color: MUTED }}>-</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>No</td>
                      <td className="px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>
                        {r.value.split("\n").map((v, i) => (
                          <div key={i} className="overflow-hidden text-ellipsis whitespace-nowrap" title={v}>
                            {v}
                          </div>
                        ))}
                      </td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{r.ttl ?? "-"}</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)", color: MUTED }}>-</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)", color: MUTED }}>-</td>
                      <td className="truncate px-2 py-2" style={{ borderBottom: "1px solid var(--rz-divider)", color: MUTED }}>-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && displayed.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <b style={{ color: MUTED }}>No records</b>
                  <p style={{ color: SECONDARY }}>{search || activeFilters.length > 0 ? "No records match your filter." : "There are no records in this hosted zone."}</p>
                  <Button variant="primary" onClick={() => router.push(`/hosted-zones/${zoneId}/records/create`)}>Create record</Button>
                </div>
              )}
              {loading && <div className="py-12 text-center" style={{ color: MUTED }}>Loading records…</div>}
            </div>
          </section>
        )}

        {tab === "recovery" && (
          <PlaceholderTab title="Accelerated recovery" action="Enable"
            body="Enable the accelerated recovery option to ensure that you can continue to make changes to your public DNS records after an impairment to US East (N. Virginia)."
            statusLabel="Status" status="Disabled" />
        )}
        {tab === "dnssec" && (
          <PlaceholderTab title="DNSSEC signing" action="Enable DNSSEC signing"
            body="DNSSEC signing status: Not signing. To enable DNSSEC signing, choose Enable DNSSEC signing, then complete the steps to establish a chain of trust for your hosted zone." />
        )}
        {tab === "tags" && (
          <section className={card + " mt-5"} style={cardStyle}>
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>Tags</h2>
              <Button>Manage tags</Button>
            </div>
            <p className="px-5 pb-6 text-[14px]" style={{ color: MUTED }}>No tags associated with the resource.</p>
          </section>
        )}
      </div>

      {/* Create/Edit record modal */}
      <RecordForm zoneId={zoneId} zoneName={zoneName} record={editing} open={formOpen} onClose={() => setFormOpen(false)} onSaved={refreshAll} />

      {/* Delete records modal */}
      <Modal
        open={deleteOpen}
        title={`Delete ${selectedRecords.length > 1 ? `${selectedRecords.length} records` : "record"}?`}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="primary" onClick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</Button>
          </>
        }
      >
        <p>Permanently delete {one ? <b>{one.name} ({one.type})</b> : <b>{selectedRecords.length} records</b>}? This action cannot be undone.</p>
      </Modal>

      {/* Export zone file modal */}
      <Modal
        open={exportOpen}
        title="Export zone file"
        onClose={() => setExportOpen(false)}
        footer={
          <>
            <Button onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
            <Button variant="primary" onClick={doExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Download"}
            </Button>
          </>
        }
      >
        <p className="mb-3" style={{ color: SECONDARY }}>
          Download every record in <b>{zoneName}</b> in the format you choose.
        </p>
        <div className="flex flex-col gap-2">
          {([
            ["bind", "BIND zone file (.txt)", "RFC 1035 master-file format — the same format used by Import zone file."],
            ["json", "JSON (.json)", "Structured JSON with the hosted zone and all of its records."],
          ] as const).map(([value, title, desc]) => {
            const selected = exportFormat === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setExportFormat(value)}
                className="flex items-start gap-2 rounded-lg px-3 pb-3 pt-2 text-left"
                style={{
                  backgroundColor: selected ? "var(--rz-selected)" : "var(--rz-surface)",
                  border: `1px solid ${selected ? LINK : "var(--rz-borderstrong)"}`,
                }}
              >
                <span className="mt-0.5">
                  <svg viewBox="0 0 100 100" width="16" height="16" aria-hidden>
                    <circle cx="50" cy="50" r="46" fill="none" stroke={selected ? LINK : "var(--rz-borderstrong)"} strokeWidth="6.25" />
                    {selected && <circle cx="50" cy="50" r="22" fill={LINK} />}
                  </svg>
                </span>
                <span>
                  <span className="block text-[14px] leading-5" style={{ color: INK }}>{title}</span>
                  <span className="block text-[12px] leading-4" style={{ color: MUTED }}>{desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Delete zone modal */}
      <Modal
        open={deleteZoneOpen}
        title="Delete hosted zone?"
        onClose={() => setDeleteZoneOpen(false)}
        footer={
          <>
            <Button onClick={() => setDeleteZoneOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={doDeleteZone}>Delete</Button>
          </>
        }
      >
        <p>Permanently delete <b>{zoneName}</b> and all of its records? This action cannot be undone.</p>
      </Modal>
    </AppShell>
  );
}

function FilterPill({
  value,
  onChange,
  placeholder,
  options,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  width: number;
}) {
  return (
    <div className="relative" style={{ width }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full appearance-none truncate rounded-lg bg-[var(--rz-surface)] pl-3 pr-7 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]"
        style={{ border: "1px solid var(--rz-borderstrong)", color: value ? INK : MUTED }}
      >
        {/* Once a value is chosen the placeholder option disappears from the list — the
            chosen value is shown, and removal happens via the filter tokens below. */}
        {!value && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o} style={{ color: INK }}>
            {o}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" style={{ color: INK }}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
          <path d="M8 11 4 5h8l-4 6Z" />
        </svg>
      </span>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[14px] font-bold" style={{ color: INK }}>{label}</div>
      <div className={"mt-0.5 whitespace-pre-line break-all text-[14px]" + (mono ? " font-mono text-[13px]" : "")} style={{ color: value === "-" ? MUTED : INK }}>
        {value}
      </div>
    </div>
  );
}

/* Split-panel detail for a single selected record (mirrors the hosted-zone split panel). */
function CopyRow({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Copy ${text} to clipboard`}
        onClick={() => navigator.clipboard?.writeText(text)}
        style={{ color: LINK }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
          <path d="M15 5H5v10h10V5Z" strokeLinejoin="round" />
          <path d="M13 1H1v11" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="break-all">{text}</span>
    </span>
  );
}

function RecordSplitField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="text-[14px] font-bold" style={{ color: INK }}>{label}</div>
      <div className="mt-0.5 text-[14px]" style={{ color: INK }}>{children}</div>
    </div>
  );
}

function RecordSplitDetail({ record, onEdit }: { record: DNSRecord; onEdit: () => void }) {
  return (
    <div style={{ color: INK }}>
      <div className="pb-3">
        <Button onClick={onEdit}>Edit record</Button>
      </div>
      <RecordSplitField label="Record name"><CopyRow text={record.name} /></RecordSplitField>
      <RecordSplitField label="Record type">{record.type}</RecordSplitField>
      <RecordSplitField label="Value">
        <div className="flex flex-col gap-1">
          {record.value.split("\n").map((v, i) => (
            <CopyRow key={i} text={v} />
          ))}
        </div>
      </RecordSplitField>
      <RecordSplitField label="Alias">No</RecordSplitField>
      <RecordSplitField label="TTL (seconds)">{record.ttl ?? "-"}</RecordSplitField>
      <RecordSplitField label="Routing policy">{record.routing_policy || "Simple"}</RecordSplitField>
    </div>
  );
}

function PlaceholderTab({ title, body, action, statusLabel, status }: { title: string; body: string; action: string; statusLabel?: string; status?: string }) {
  return (
    <section className="mt-5 rounded-[16px] bg-[var(--rz-surface)]" style={{ border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="text-[20px] font-bold" style={{ letterSpacing: "-0.3px" }}>{title}</h2>
        <Button>{action}</Button>
      </div>
      <div className="px-5 pb-6">
        <p className="text-[14px]" style={{ color: SECONDARY }}>{body}</p>
        {statusLabel && (
          <div className="mt-4">
            <div className="text-[14px] font-bold" style={{ color: INK }}>{statusLabel}</div>
            <div className="mt-0.5 text-[14px]" style={{ color: MUTED }}>⊘ {status}</div>
          </div>
        )}
      </div>
    </section>
  );
}
