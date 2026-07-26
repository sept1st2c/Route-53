"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useResizableColumns, ResizeHandle } from "@/components/ui/ResizableColumns";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { useDrawer } from "@/context/DrawerContext";
import { useHotkey } from "@/lib/useHotkey";
import type { HostedZone } from "@/types";

const INK = "var(--rz-ink)";
const SECONDARY = "var(--rz-secondary)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const BORDER = "var(--rz-border)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';
const LIMIT = 10;

const COLUMNS = ["Hosted zone name", "Type", "Created by", "Record count", "Description", "Hosted zone ID"];
const COL_DEFAULTS = [240, 90, 110, 130, 240, 220];
const CHECKBOX_W = 44;

function SortCaret() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--rz-borderstrong)" aria-hidden className="ml-1 inline-block">
      <path d="M8 11 4 5h8l-4 6Z" />
    </svg>
  );
}

export default function HostedZonesPage() {
  const router = useRouter();
  const { notify } = useNotify();

  const [zones, setZones] = useState<HostedZone[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { widths, total: tableWidth, startResize } = useResizableColumns(COL_DEFAULTS);

  useHotkey("c", () => router.push("/hosted-zones/create"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await zoneService.list({ search, page, limit: LIMIT });
      setZones(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setSelected(new Set());
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load hosted zones") });
    } finally {
      setLoading(false);
    }
  }, [search, page, notify]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => (s.size === zones.length ? new Set() : new Set(zones.map((z) => z.id))));

  const selectedZones = zones.filter((z) => selected.has(z.id));
  const one = selectedZones.length === 1 ? selectedZones[0] : null;

  // Feed the split panel: name servers for the single selected zone, then the detail.
  const { setSplitData } = useDrawer();
  const [ns, setNs] = useState<string[]>([]);
  const selectedId = one?.id ?? null;

  useEffect(() => {
    if (selectedId == null) {
      setNs([]);
      return;
    }
    let active = true;
    recordService
      .list(selectedId, { type: "NS", limit: 5 })
      .then((d) => {
        if (!active) return;
        const apex = d.items[0];
        setNs(apex ? apex.value.split("\n").map((v) => v.replace(/\.$/, "")) : []);
      })
      .catch(() => active && setNs([]));
    return () => { active = false; };
  }, [selectedId]);

  const selectedCount = selectedZones.length;
  useEffect(() => {
    setSplitData({ count: selectedCount, detail: one ? <ZoneSplitDetail zone={one} ns={ns} /> : null });
    // `one` is derived from selectedId; excluded to avoid a re-render loop on its changing identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCount, selectedId, ns, setSplitData]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await Promise.all(selectedZones.map((z) => zoneService.remove(z.id)));
      notify({
        type: "success",
        content: `Deleted ${selectedZones.length} hosted zone${selectedZones.length > 1 ? "s" : ""}.`,
      });
      setDeleteOpen(false);
      // reset to page 1 if current page may be empty
      if (zones.length === selectedZones.length && page > 1) setPage((p) => p - 1);
      else load();
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to delete hosted zone") });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell breadcrumbs={[{ label: "Route 53", href: "/dashboard" }, { label: "Hosted zones" }]}>
      <div className="px-7 pt-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-1">
          <h1 className="text-[24px] leading-[30px]" style={{ letterSpacing: "-0.48px" }}>
            <span className="font-bold">Hosted zones</span> <span style={{ color: MUTED }}>({total})</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button iconOnly aria-label="Refresh hosted zones" onClick={() => load()}>
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M15 0v5l-5-.04" strokeLinejoin="round" />
                <path d="M15 8c0 3.87-3.13 7-7 7s-7-3.13-7-7 3.13-7 7-7c2.79 0 5.2 1.63 6.33 4" />
              </svg>
            </Button>
            <Button disabled={!one} onClick={() => one && router.push(`/hosted-zones/${one.id}/records`)}>
              View details
            </Button>
            <Button disabled={!one} onClick={() => one && router.push(`/hosted-zones/${one.id}/edit`)}>
              Edit
            </Button>
            <Button disabled={selectedZones.length === 0} onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
            <Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>
              Create hosted zone
            </Button>
          </div>
        </div>

        <p className="pb-3 text-[14px]" style={{ color: SECONDARY }}>
          Automatic mode is the current search behavior optimized for best filter results.{" "}
          <button style={{ color: LINK, textDecoration: "underline" }}>To change modes go to settings.</button>
        </p>

        {/* Filter + pagination */}
        <div className="flex flex-wrap items-center gap-3 pb-2">
          <div className="relative min-w-[280px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }}>
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="m11 11 4 4M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="page-filter-input"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Filter records by property or value"
              className="h-8 w-full rounded-lg bg-[var(--rz-surface)] pl-9 pr-3 text-[14px] italic placeholder:text-[var(--rz-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]"
              style={{ border: "1px solid var(--rz-borderstrong)", fontStyle: search ? "normal" : "italic" }}
            />
          </div>
          <div className="flex items-center gap-1" style={{ color: SECONDARY }}>
            <button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 disabled:opacity-40"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M11 2 5 8l6 6" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="min-w-5 text-center text-[14px] font-bold">{page}</span>
            <button
              aria-label="Next page"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="p-1 disabled:opacity-40"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="m5 2 6 6-6 6" strokeLinejoin="round" />
              </svg>
            </button>
            <button aria-label="Preferences" className="ml-1 p-1">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                <path d="M6.11 1.729c.07-.42.44-.729.86-.729h2.02c.43 0 .79.31.86.729l.17.999c.05.29.24.529.5.679.06.03.11.06.17.1.25.15.56.2.84.1l.95-.35c.4-.15.85 0 1.07.38l1.01 1.747c.21.37.13.839-.2 1.108l-.78.64c-.23.189-.34.479-.33.768v.2c0 .29.11.579.33.769l.78.639c.33.27.42.739.2 1.108l-1.01 1.748c-.21.37-.66.529-1.06.38l-.95-.35a.966.966 0 0 0-.84.1c-.06.03-.11.07-.17.1-.26.14-.45.389-.5.679l-.17.998A.878.878 0 0 1 9 15H6.98a.87.87 0 0 1-.86-.729l-.17-.998a.988.988 0 0 0-.5-.68c-.06-.03-.11-.06-.17-.1a.996.996 0 0 0-.84-.1l-.95.35c-.4.15-.85 0-1.06-.38l-1.01-1.747a.873.873 0 0 1 .2-1.108l.78-.64c.23-.189.34-.479.33-.768v-.2c0-.3-.11-.579-.33-.769l-.78-.639a.861.861 0 0 1-.2-1.108l1.01-1.748c.21-.37.66-.529 1.07-.38l.95.35c.28.1.58.06.84-.1.06-.03.11-.07.17-.1.26-.14.45-.379.5-.678l.15-1Z" strokeLinejoin="round" />
                <path d="M10 8c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2Z" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
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
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={zones.length > 0 && selected.size === zones.length}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5"
                    style={{ accentColor: LINK }}
                  />
                </th>
                {COLUMNS.map((c, i) => (
                  <th
                    key={c}
                    className="relative px-2 py-2 text-left align-middle font-bold"
                    style={{ color: SECONDARY, borderBottom: `1px solid ${BORDER}` }}
                  >
                    <span className="flex items-center overflow-hidden">
                      <span className="truncate">{c}</span>
                      <SortCaret />
                    </span>
                    {i < COLUMNS.length - 1 && <ResizeHandle onMouseDown={(e) => startResize(i, e)} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="hover:bg-[var(--rz-hover)]">
                  <td className="px-2 py-2 align-middle" style={{ borderBottom: "1px solid var(--rz-divider)" }}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${z.name}`}
                      checked={selected.has(z.id)}
                      onChange={() => toggle(z.id)}
                      className="h-3.5 w-3.5"
                      style={{ accentColor: LINK }}
                    />
                  </td>
                  <td className="truncate px-2 py-2 align-middle" style={{ borderBottom: "1px solid var(--rz-divider)" }}>
                    <button
                      onClick={() => router.push(`/hosted-zones/${z.id}/records`)}
                      className="max-w-full truncate align-bottom"
                      title={z.name}
                      style={{ color: LINK, textDecoration: "underline" }}
                    >
                      {z.name}
                    </button>
                  </td>
                  <td className="truncate px-2 py-2 align-middle" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{z.type}</td>
                  <td className="truncate px-2 py-2 align-middle" style={{ borderBottom: "1px solid var(--rz-divider)" }}>Route 53</td>
                  <td className="truncate px-2 py-2 align-middle" style={{ borderBottom: "1px solid var(--rz-divider)" }}>{z.record_count}</td>
                  <td className="truncate px-2 py-2 align-middle" title={z.comment || undefined} style={{ borderBottom: "1px solid var(--rz-divider)", color: z.comment ? INK : MUTED }}>
                    {z.comment || "-"}
                  </td>
                  <td className="truncate px-2 py-2 align-middle font-mono text-[13px]" title={z.zone_id} style={{ borderBottom: "1px solid var(--rz-divider)" }}>
                    {z.zone_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Empty state */}
          {!loading && zones.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <b style={{ color: MUTED }}>No hosted zones</b>
              <p style={{ color: SECONDARY }}>
                {search ? "No hosted zones match your filter." : "There are no hosted zones created for this account."}
              </p>
              {!search && (
                <Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>
                  Create hosted zone
                </Button>
              )}
            </div>
          )}
          {loading && <div className="py-12 text-center" style={{ color: MUTED }}>Loading hosted zones…</div>}
        </div>
      </div>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        title={`Delete ${selectedZones.length > 1 ? `${selectedZones.length} hosted zones` : "hosted zone"}?`}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={doDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p>
          Permanently delete{" "}
          {one ? (
            <b>{one.name}</b>
          ) : (
            <b>{selectedZones.length} hosted zones</b>
          )}
          ? This will remove all of its DNS records. This action cannot be undone.
        </p>
      </Modal>
    </AppShell>
  );
}

/* Split-panel detail for a single selected hosted zone (matches the AWS split panel). */
function ZoneSplitDetail({ zone, ns }: { zone: HostedZone; ns: string[] }) {
  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="py-3">
      <div className="text-[14px] font-bold" style={{ color: INK }}>{label}</div>
      <div className="text-[14px]" style={{ color: value === "-" ? MUTED : INK }}>{value}</div>
    </div>
  );
  return (
    <div style={{ color: INK }}>
      <Field label="Hosted zone name" value={zone.name.replace(/\.$/, "")} />
      <Field label="Hosted zone ID" value={zone.zone_id} />
      <Field label="Description" value={zone.comment || "-"} />
      <Field label="Query log" value="-" />
      <Field label="Type" value={`${zone.type} hosted zone`} />
      <Field label="Record count" value={String(zone.record_count)} />
      <div className="py-3">
        <div className="text-[14px] font-bold" style={{ color: INK }}>Name servers</div>
        {ns.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-[14px]">
            {ns.map((n) => (<li key={n}>{n}</li>))}
          </ul>
        ) : (
          <div className="text-[14px]" style={{ color: MUTED }}>-</div>
        )}
      </div>
    </div>
  );
}
