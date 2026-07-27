"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import RadioGroup from "@cloudscape-design/components/radio-group";
import { AppShell } from "@/components/layout/AppShell";
import { Button as AwsButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { useDrawer } from "@/context/DrawerContext";
import { useHotkey } from "@/lib/useHotkey";
import type { HostedZone } from "@/types";

type SearchMode = "automatic" | "full" | "fast";
type Prefs = CollectionPreferencesProps.Preferences<SearchMode>;

const PREFS_STORAGE_KEY = "r53-hosted-zones-prefs";

const ALL_COLUMN_IDS = ["name", "type", "createdBy", "record_count", "comment", "zone_id"];

const DEFAULT_PREFS: Prefs = {
  pageSize: 10,
  wrapLines: false,
  visibleContent: ALL_COLUMN_IDS,
  custom: "automatic",
};

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<HostedZone>[] = [
  {
    id: "name",
    header: "Hosted zone name",
    sortingField: "name",
    width: 260,
    minWidth: 160,
    cell: (z) => <ZoneNameLink zone={z} />,
  },
  { id: "type", header: "Type", sortingField: "type", width: 110, minWidth: 90, cell: (z) => z.type },
  { id: "createdBy", header: "Created by", width: 130, minWidth: 100, cell: () => "Route 53" },
  {
    id: "record_count",
    header: "Record count",
    sortingField: "record_count",
    width: 140,
    minWidth: 110,
    cell: (z) => z.record_count,
  },
  {
    id: "comment",
    header: "Description",
    sortingField: "comment",
    width: 260,
    minWidth: 120,
    cell: (z) => z.comment || "-",
  },
  {
    id: "zone_id",
    header: "Hosted zone ID",
    sortingField: "zone_id",
    width: 220,
    minWidth: 140,
    cell: (z) => z.zone_id,
  },
];

/** Zone name cell — navigates to the zone's records via the app router. */
function ZoneNameLink({ zone }: { zone: HostedZone }) {
  const router = useRouter();
  const href = `/hosted-zones/${zone.id}/records`;
  return (
    <Link
      href={href}
      onFollow={(e) => {
        e.preventDefault();
        router.push(href);
      }}
    >
      {zone.name}
    </Link>
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
  const [selectedItems, setSelectedItems] = useState<HostedZone[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<HostedZone>>({
    sortingField: "created_at",
  });
  const [sortingDescending, setSortingDescending] = useState(true);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // Restore saved table preferences (page size, visible columns, …) like the real console does.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed saved preferences */
    }
  }, []);

  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    setPage(1);
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable — preferences just won't persist */
    }
  };

  useHotkey("c", () => router.push("/hosted-zones/create"));

  const pageSize = prefs.pageSize ?? 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await zoneService.list({
        search,
        page,
        limit: pageSize,
        sortBy: sortingColumn.sortingField ?? "created_at",
        sortOrder: sortingDescending ? "desc" : "asc",
      });
      setZones(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setSelectedItems([]);
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load hosted zones") });
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize, sortingColumn, sortingDescending, notify]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const one = selectedItems.length === 1 ? selectedItems[0] : null;

  // Feed the split panel: name servers for the single selected zone, then the detail.
  const { setSplitData, openInfoDrawer } = useDrawer();
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
    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectedCount = selectedItems.length;
  useEffect(() => {
    setSplitData({
      count: selectedCount,
      noun: "hosted zone",
      detailTitle: "Hosted zone details",
      fields: one
        ? [
            { label: "Hosted zone name", value: one.name.replace(/\.$/, "") },
            { label: "Hosted zone ID", value: one.zone_id },
            { label: "Description", value: one.comment || "-" },
            { label: "Query log", value: "-" },
            { label: "Type", value: `${one.type} hosted zone` },
            { label: "Record count", value: String(one.record_count) },
            {
              label: "Name servers",
              value:
                ns.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {ns.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  "-"
                ),
            },
          ]
        : undefined,
    });
    // `one` is derived from selectedId; excluded to avoid a re-render loop on its changing identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCount, selectedId, ns, setSplitData]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await Promise.all(selectedItems.map((z) => zoneService.remove(z.id)));
      notify({
        type: "success",
        content: `Deleted ${selectedItems.length} hosted zone${selectedItems.length > 1 ? "s" : ""}.`,
      });
      setDeleteOpen(false);
      // step back a page if we just emptied the last one
      if (zones.length === selectedItems.length && page > 1) setPage((p) => p - 1);
      else load();
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to delete hosted zone") });
    } finally {
      setDeleting(false);
    }
  };

  const visibleContentOptions = useMemo(
    () => [
      {
        label: "Properties",
        options: COLUMN_DEFINITIONS.map((c) => ({ id: c.id as string, label: String(c.header) })),
      },
    ],
    []
  );

  return (
    <AppShell
      breadcrumbs={[{ label: "Route 53", href: "/dashboard" }, { label: "Hosted zones" }]}
      splitPanel
    >
      <Table<HostedZone>
          variant="full-page"
          items={zones}
          columnDefinitions={COLUMN_DEFINITIONS}
          visibleColumns={prefs.visibleContent}
          trackBy="id"
          resizableColumns
          wrapLines={prefs.wrapLines}
          loading={loading}
          loadingText="Loading hosted zones"
          // The console lets you select a single hosted zone (a radio, no select-all),
          // because every action here — View details, Edit, Delete — targets one zone.
          selectionType="single"
          selectedItems={selectedItems}
          onSelectionChange={({ detail }) => setSelectedItems([...detail.selectedItems])}
          sortingColumn={sortingColumn}
          sortingDescending={sortingDescending}
          onSortingChange={({ detail }) => {
            setSortingColumn(detail.sortingColumn);
            setSortingDescending(detail.isDescending ?? false);
            setPage(1);
          }}
          ariaLabels={{
            selectionGroupLabel: "Hosted zone selection",
            itemSelectionLabel: (_data, row) => `Select ${row.name}`,
          }}
          header={
            <Header
              variant="h1"
              // The console reports the selection as "(selected/total)" and falls back to
              // the plain total when nothing is selected.
              counter={selectedItems.length > 0 ? `(${selectedItems.length}/${total})` : `(${total})`}
              info={
                <Link variant="info" onFollow={(e) => { e.preventDefault(); openInfoDrawer(); }}>
                  Info
                </Link>
              }
              description="Automatic mode is the current search behavior optimized for best filter results."
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button iconName="refresh" ariaLabel="Refresh hosted zones" onClick={() => load()} />
                  <Button
                    disabled={!one}
                    onClick={() => one && router.push(`/hosted-zones/${one.id}/records`)}
                  >
                    View details
                  </Button>
                  <Button disabled={!one} onClick={() => one && router.push(`/hosted-zones/${one.id}/edit`)}>
                    Edit
                  </Button>
                  <Button disabled={selectedItems.length === 0} onClick={() => setDeleteOpen(true)}>
                    Delete
                  </Button>
                  <Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>
                    Create hosted zone
                  </Button>
                </SpaceBetween>
              }
            >
              Hosted zones
            </Header>
          }
          filter={
            <TextFilter
              // The "/" shortcut focuses this input by id.
              controlId="page-filter-input"
              filteringText={search}
              filteringPlaceholder="Filter records by property or value"
              filteringAriaLabel="Filter hosted zones"
              countText={search ? `${total} ${total === 1 ? "match" : "matches"}` : ""}
              onChange={({ detail }) => {
                setPage(1);
                setSearch(detail.filteringText);
              }}
            />
          }
          pagination={
            <Pagination
              currentPageIndex={page}
              pagesCount={pages}
              onChange={({ detail }) => setPage(detail.currentPageIndex)}
            />
          }
          preferences={
            <CollectionPreferences
              title="Preferences"
              confirmLabel="Confirm"
              cancelLabel="Cancel"
              preferences={prefs}
              onConfirm={({ detail }) => savePrefs(detail as Prefs)}
              pageSizePreference={{
                title: "Page size",
                options: [
                  { value: 10, label: "10 items" },
                  { value: 30, label: "30 items" },
                  { value: 50, label: "50 items" },
                  { value: 100, label: "100 items" },
                ],
              }}
              wrapLinesPreference={{
                label: "Wrap lines",
                description: "Check to see all the text and wrap the lines.",
              }}
              visibleContentPreference={{
                title: "Select visible columns",
                options: visibleContentOptions,
              }}
              customPreference={(value: SearchMode, setValue) => (
                <FormField label="Search mode">
                  <RadioGroup
                    value={value ?? "automatic"}
                    onChange={({ detail }) => setValue(detail.value as SearchMode)}
                    items={[
                      {
                        value: "automatic",
                        label: "Automatic",
                        description:
                          "The service chooses a filter mode based on the total number of items.",
                      },
                      {
                        value: "full",
                        label: "Full",
                        description:
                          "All search filters are available, but search performance might be slower.",
                      },
                      {
                        value: "fast",
                        label: "Fast",
                        description:
                          "Some advanced searches may not be available, but search performance will be faster.",
                      },
                    ]}
                  />
                </FormField>
              )}
            />
          }
          empty={
            <Box textAlign="center" padding={{ vertical: "xl" }}>
              <SpaceBetween size="m">
                <Box variant="strong" color="inherit">
                  No hosted zones
                </Box>
                <Box variant="p" color="inherit">
                  {search
                    ? "No hosted zones match your filter."
                    : "There are no hosted zones created for this account."}
                </Box>
                {!search && (
                  <Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>
                    Create hosted zone
                  </Button>
                )}
              </SpaceBetween>
            </Box>
          }
        />

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        title={`Delete ${selectedItems.length > 1 ? `${selectedItems.length} hosted zones` : "hosted zone"}?`}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <AwsButton onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </AwsButton>
            <AwsButton variant="primary" onClick={doDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AwsButton>
          </>
        }
      >
        <p>
          Permanently delete {one ? <b>{one.name}</b> : <b>{selectedItems.length} hosted zones</b>}? This
          will remove all of its DNS records. This action cannot be undone.
        </p>
      </Modal>
    </AppShell>
  );
}
