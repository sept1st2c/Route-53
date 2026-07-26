"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import FormField from "@cloudscape-design/components/form-field";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import TokenGroup from "@cloudscape-design/components/token-group";
import ContentLayout from "@cloudscape-design/components/content-layout";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Container from "@cloudscape-design/components/container";
import Tabs from "@cloudscape-design/components/tabs";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { AppShell } from "@/components/layout/AppShell";
import { Button as AwsButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RecordForm } from "@/components/records/RecordForm";
import { zoneService, recordService } from "@/lib/services";
import { api, apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { useDrawer } from "@/context/DrawerContext";
import { useHotkey } from "@/lib/useHotkey";
import { RECORD_TYPES, type DNSRecord, type HostedZone, type Paginated } from "@/types";

type Tab = "records" | "recovery" | "dnssec" | "tags";
type SearchMode = "automatic" | "full" | "fast";
type Prefs = CollectionPreferencesProps.Preferences<SearchMode>;

const PREFS_STORAGE_KEY = "r53-records-prefs";

const ROUTING_POLICIES = ["Simple", "Weighted", "Latency", "Failover", "Geolocation"];

/** Newline-separated record values are shown one per line, as the console does. */
function RecordValue({ value }: { value: string }) {
  return (
    <>
      {value.split("\n").map((v, i) => (
        <div key={i}>{v}</div>
      ))}
    </>
  );
}

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<DNSRecord>[] = [
  { id: "name", header: "Record name", sortingField: "name", width: 210, minWidth: 140, cell: (r) => r.name },
  { id: "type", header: "Type", sortingField: "type", width: 100, minWidth: 80, cell: (r) => r.type },
  {
    id: "routing_policy",
    header: "Routing policy",
    sortingField: "routing_policy",
    width: 150,
    minWidth: 100,
    cell: (r) => r.routing_policy || "Simple",
  },
  { id: "differentiator", header: "Differentiator", width: 150, minWidth: 100, cell: () => "-" },
  { id: "alias", header: "Alias", width: 90, minWidth: 70, cell: () => "No" },
  {
    id: "value",
    header: "Value/Route traffic to",
    sortingField: "value",
    width: 280,
    minWidth: 160,
    cell: (r) => <RecordValue value={r.value} />,
  },
  { id: "ttl", header: "TTL (seconds)", sortingField: "ttl", width: 140, minWidth: 100, cell: (r) => r.ttl ?? "-" },
  { id: "health_check_id", header: "Health check ID", width: 160, minWidth: 110, cell: () => "-" },
  { id: "evaluate_target_health", header: "Evaluate target health", width: 200, minWidth: 130, cell: () => "-" },
  { id: "record_id", header: "Record ID", width: 130, minWidth: 90, cell: () => "-" },
];

const ALL_COLUMN_IDS = COLUMN_DEFINITIONS.map((c) => c.id as string);

const DEFAULT_PREFS: Prefs = {
  pageSize: 10,
  wrapLines: false,
  visibleContent: ALL_COLUMN_IDS,
  custom: "automatic",
};

/**
 * Records list request. It goes straight to the API instead of through `recordService`
 * because sorting has to be resolved server-side — sorting only the current page would
 * reorder 10 rows out of the whole zone.
 */
async function listRecords(
  zoneId: number,
  q: {
    search: string;
    type: string;
    routingPolicy: string;
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }
): Promise<Paginated<DNSRecord>> {
  const { data } = await api.get<Paginated<DNSRecord>>(`/zones/${zoneId}/records`, {
    params: {
      search: q.search,
      type: q.type,
      routing_policy: q.routingPolicy,
      page: q.page,
      limit: q.limit,
      sort_by: q.sortBy,
      sort_order: q.sortOrder,
    },
  });
  return data;
}

export default function RecordsPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [nameServers, setNameServers] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [routingFilter, setRoutingFilter] = useState("");
  const [aliasFilter, setAliasFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<DNSRecord[]>([]);
  const [tab, setTab] = useState<Tab>("records");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<DNSRecord>>({
    sortingField: "name",
  });
  const [sortingDescending, setSortingDescending] = useState(false);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DNSRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteZoneOpen, setDeleteZoneOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "bind">("bind");
  const [exporting, setExporting] = useState(false);

  useHotkey("c", () => router.push(`/hosted-zones/${zoneId}/records/create`));

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

  const pageSize = prefs.pageSize ?? 10;

  const loadZone = useCallback(async () => {
    try {
      setZone(await zoneService.get(zoneId));
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load hosted zone") });
    }
  }, [zoneId, notify]);

  // Name servers come from a dedicated lookup so the details section stays correct
  // whichever page of records is on screen.
  const loadNameServers = useCallback(async () => {
    try {
      const d = await recordService.list(zoneId, { type: "NS", limit: 5 });
      const apex = d.items[0];
      setNameServers(apex ? apex.value.split("\n").map((v) => v.replace(/\.$/, "")) : []);
    } catch {
      setNameServers([]);
    }
  }, [zoneId]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRecords(zoneId, {
        search,
        type: typeFilter,
        routingPolicy: routingFilter,
        page,
        limit: pageSize,
        sortBy: sortingColumn.sortingField ?? "name",
        sortOrder: sortingDescending ? "desc" : "asc",
      });
      setRecords(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setSelectedItems([]);
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load records") });
    } finally {
      setLoading(false);
    }
  }, [zoneId, search, typeFilter, routingFilter, page, pageSize, sortingColumn, sortingDescending, notify]);

  useEffect(() => {
    loadZone();
    loadNameServers();
  }, [loadZone, loadNameServers]);

  useEffect(() => {
    const t = setTimeout(loadRecords, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadRecords, search]);

  const refreshAll = () => {
    loadZone();
    loadNameServers();
    loadRecords();
  };

  // The default zone-apex NS and SOA records are managed by Route 53 and can't be deleted.
  const isProtected = (r: DNSRecord) => r.type === "SOA" || (r.type === "NS" && r.name === zone?.name);

  // Every record in this clone is non-alias, so "Alias" can never match and "Non-alias" matches all.
  const aliasMatchesNothing = aliasFilter === "Alias";
  const items = aliasMatchesNothing ? [] : records;
  const matchCount = aliasMatchesNothing ? 0 : total;
  const pageCount = aliasMatchesNothing ? 1 : pages;

  const appliedFilters = [
    typeFilter && { key: "type", label: `Type = ${typeFilter}`, clear: () => { setPage(1); setTypeFilter(""); } },
    routingFilter && {
      key: "routing",
      label: `Routing policy = ${routingFilter}`,
      clear: () => { setPage(1); setRoutingFilter(""); },
    },
    aliasFilter && {
      key: "alias",
      label: `Alias = ${aliasFilter === "Alias" ? "Yes" : "No"}`,
      clear: () => { setPage(1); setAliasFilter(""); },
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAllFilters = () => {
    setPage(1);
    setTypeFilter("");
    setRoutingFilter("");
    setAliasFilter("");
  };

  const one = selectedItems.length === 1 ? selectedItems[0] : null;
  const selectionHasProtected = selectedItems.some(isProtected);

  // Feed the split panel: one record → its details, otherwise the selection count.
  const { setSplitData } = useDrawer();
  const selectedCount = selectedItems.length;
  const selectedId = one?.id ?? null;
  useEffect(() => {
    setSplitData({
      count: selectedCount,
      noun: "record",
      detailTitle: "Record details",
      fields: one
        ? [
            { label: "Record name", value: <Copyable text={one.name} /> },
            { label: "Record type", value: one.type },
            {
              label: "Value",
              value: (
                <SpaceBetween size="xxs">
                  {one.value.split("\n").map((v, i) => (
                    <Copyable key={i} text={v} />
                  ))}
                </SpaceBetween>
              ),
            },
            { label: "Alias", value: "No" },
            { label: "TTL (seconds)", value: one.ttl ?? "-" },
            { label: "Routing policy", value: one.routing_policy || "Simple" },
          ]
        : undefined,
    });
    // `one` is derived from selectedId; excluded to avoid a re-render loop on its changing identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCount, selectedId, setSplitData]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await recordService.bulkRemove(zoneId, selectedItems.map((r) => r.id));
      notify({
        type: "success",
        content: `Deleted ${selectedItems.length} record${selectedItems.length > 1 ? "s" : ""}.`,
      });
      setDeleteOpen(false);
      // step back a page if we just emptied the last one
      if (records.length === selectedItems.length && page > 1) setPage((p) => p - 1);
      else refreshAll();
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

  const visibleContentOptions = useMemo(
    () => [
      {
        label: "Properties",
        options: COLUMN_DEFINITIONS.map((c) => ({ id: c.id as string, label: String(c.header) })),
      },
    ],
    []
  );

  const zoneName = zone?.name ?? "";
  const displayName = zoneName.replace(/\.$/, "");

  const recordsTable = (
    <Table<DNSRecord>
      variant="container"
      items={items}
      columnDefinitions={COLUMN_DEFINITIONS}
      visibleColumns={prefs.visibleContent}
      trackBy="id"
      resizableColumns
      wrapLines={prefs.wrapLines}
      loading={loading}
      loadingText="Loading records"
      selectionType="multi"
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
        selectionGroupLabel: "Record selection",
        allItemsSelectionLabel: () => "Select all",
        itemSelectionLabel: (_data, row) => `Select ${row.name}`,
      }}
      header={
        <Header
          variant="h2"
          counter={`(${total})`}
          description="Automatic mode is the current search behavior optimized for best filter results."
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh records" onClick={refreshAll} />
              <Button
                disabled={!one}
                onClick={() => {
                  if (one) {
                    setEditing(one);
                    setFormOpen(true);
                  }
                }}
              >
                Edit record
              </Button>
              <Button
                disabled={selectedItems.length === 0 || selectionHasProtected}
                disabledReason={
                  selectionHasProtected ? "The default NS and SOA records cannot be deleted." : undefined
                }
                onClick={() => setDeleteOpen(true)}
              >
                Delete record
              </Button>
              <Button onClick={() => router.push(`/hosted-zones/${zoneId}/import`)}>Import zone file</Button>
              <Button onClick={() => setExportOpen(true)}>Export zone file</Button>
              <Button variant="primary" onClick={() => router.push(`/hosted-zones/${zoneId}/records/create`)}>
                Create record
              </Button>
            </SpaceBetween>
          }
        >
          Records
        </Header>
      }
      filter={
        <SpaceBetween size="xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1">
              <TextFilter
                controlId="page-filter-input"
                filteringText={search}
                filteringPlaceholder="Filter records by property or value"
                filteringAriaLabel="Filter records"
                countText={search ? matchLabel(matchCount) : ""}
                onChange={({ detail }) => {
                  setPage(1);
                  setSearch(detail.filteringText);
                }}
              />
            </div>
            <FilterSelect
              placeholder="Type"
              width={110}
              value={typeFilter}
              options={[...RECORD_TYPES]}
              onChange={(v) => {
                setPage(1);
                setTypeFilter(v);
              }}
            />
            <FilterSelect
              placeholder="Routing policy"
              width={170}
              value={routingFilter}
              options={ROUTING_POLICIES}
              onChange={(v) => {
                setPage(1);
                setRoutingFilter(v);
              }}
            />
            <FilterSelect
              placeholder="Alias"
              width={130}
              value={aliasFilter}
              options={["Alias", "Non-alias"]}
              onChange={(v) => {
                setPage(1);
                setAliasFilter(v);
              }}
            />
            {appliedFilters.length > 0 && (
              <Box variant="span" color="text-body-secondary">
                {matchLabel(matchCount)}
              </Box>
            )}
          </div>

          {/* Applied filters — one removable token each, joined with "and", plus Clear filters. */}
          {appliedFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {appliedFilters.map((f, i) => (
                <div key={f.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <Box variant="span" color="text-body-secondary">
                      and
                    </Box>
                  )}
                  <TokenGroup
                    disableOuterPadding
                    items={[{ label: f.label, dismissLabel: `Remove filter ${f.label}` }]}
                    onDismiss={() => f.clear()}
                  />
                </div>
              ))}
              <Button variant="link" onClick={clearAllFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </SpaceBetween>
      }
      pagination={
        <Pagination
          currentPageIndex={page}
          pagesCount={pageCount}
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
                    description: "The service chooses a filter mode based on the total number of items.",
                  },
                  {
                    value: "full",
                    label: "Full",
                    description: "All search filters are available, but search performance might be slower.",
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
              No records
            </Box>
            <Box variant="p" color="inherit">
              {search || appliedFilters.length > 0
                ? "No records match your filter."
                : "There are no records in this hosted zone."}
            </Box>
            {!search && appliedFilters.length === 0 && (
              <Button variant="primary" onClick={() => router.push(`/hosted-zones/${zoneId}/records/create`)}>
                Create record
              </Button>
            )}
          </SpaceBetween>
        </Box>
      }
    />
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: displayName || "…" },
      ]}
      splitPanel
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setDeleteZoneOpen(true)}>Delete zone</Button>
                <Button onClick={() => router.push(`/hosted-zones/${zoneId}/test-record`)}>Test record</Button>
                <Button onClick={() => router.push(`/hosted-zones/${zoneId}/query-logging`)}>
                  Configure query logging
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween direction="horizontal" size="xs" alignItems="center">
              {zone && <Badge color="blue">{zone.type}</Badge>}
              <span>{displayName}</span>
            </SpaceBetween>
          </Header>
        }
      >
        <SpaceBetween size="l">
          <ExpandableSection
            variant="container"
            headerText="Hosted zone details"
            headerActions={
              <Button onClick={() => router.push(`/hosted-zones/${zoneId}/edit`)}>Edit hosted zone</Button>
            }
            expanded={detailsOpen}
            onChange={({ detail }) => setDetailsOpen(detail.expanded)}
          >
            <KeyValuePairs
              columns={3}
              items={[
                {
                  type: "group",
                  items: [
                    { label: "Hosted zone name", value: displayName || "-" },
                    { label: "Hosted zone ID", value: zone?.zone_id ?? "-" },
                    { label: "Description", value: zone?.comment || "-" },
                  ],
                },
                {
                  type: "group",
                  items: [
                    { label: "Query log", value: "-" },
                    {
                      label: "Type",
                      value: zone ? `${zone.type} hosted zone` : "-",
                    },
                    { label: "Record count", value: zone ? String(zone.record_count) : "-" },
                  ],
                },
                {
                  type: "group",
                  items: [
                    {
                      label: "Name servers",
                      value:
                        nameServers.length > 0 ? (
                          <ul className="list-disc pl-5">
                            {nameServers.map((n) => (
                              <li key={n}>{n}</li>
                            ))}
                          </ul>
                        ) : (
                          "-"
                        ),
                    },
                  ],
                },
              ]}
            />
          </ExpandableSection>

          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => setTab(detail.activeTabId as Tab)}
            tabs={[
              { id: "records", label: `Records (${total})`, content: recordsTable },
              {
                id: "recovery",
                label: "Accelerated recovery",
                content: (
                  <ComingSoonPanel title="Accelerated recovery">
                    Accelerated recovery lets you continue to make changes to your public DNS records after
                    an impairment to US East (N. Virginia). Enabling it isn&apos;t available in this clone.
                  </ComingSoonPanel>
                ),
              },
              {
                id: "dnssec",
                label: "DNSSEC signing",
                content: (
                  <ComingSoonPanel title="DNSSEC signing">
                    DNSSEC signing lets DNS resolvers validate that a DNS response came from Amazon Route 53
                    and has not been tampered with. Enabling signing and managing key-signing keys
                    (KSKs) isn&apos;t available in this clone.
                  </ComingSoonPanel>
                ),
              },
              {
                id: "tags",
                label: "Hosted zone tags (0)",
                content: (
                  <ComingSoonPanel title="Tags">
                    A tag is a label you assign to an AWS resource, made up of a key and a value that you
                    define — commonly used to categorize and track your Route 53 costs. Tagging hosted zones
                    isn&apos;t available in this clone.
                  </ComingSoonPanel>
                ),
              },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>

      {/* Create/Edit record modal */}
      <RecordForm
        zoneId={zoneId}
        zoneName={zoneName}
        record={editing}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
      />

      {/* Delete records modal */}
      <Modal
        open={deleteOpen}
        title={`Delete ${selectedItems.length > 1 ? `${selectedItems.length} records` : "record"}?`}
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
          Permanently delete{" "}
          {one ? (
            <b>
              {one.name} ({one.type})
            </b>
          ) : (
            <b>{selectedItems.length} records</b>
          )}
          ? This action cannot be undone.
        </p>
      </Modal>

      {/* Export zone file modal */}
      <Modal
        open={exportOpen}
        title="Export zone file"
        onClose={() => setExportOpen(false)}
        footer={
          <>
            <AwsButton onClick={() => setExportOpen(false)} disabled={exporting}>
              Cancel
            </AwsButton>
            <AwsButton variant="primary" onClick={doExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Download"}
            </AwsButton>
          </>
        }
      >
        <Box variant="p" color="text-body-secondary" padding={{ bottom: "s" }}>
          Download every record in <b>{zoneName}</b> in the format you choose.
        </Box>
        <RadioGroup
          value={exportFormat}
          onChange={({ detail }) => setExportFormat(detail.value as "json" | "bind")}
          items={[
            {
              value: "bind",
              label: "BIND zone file (.txt)",
              description: "RFC 1035 master-file format — the same format used by Import zone file.",
            },
            {
              value: "json",
              label: "JSON (.json)",
              description: "Structured JSON with the hosted zone and all of its records.",
            },
          ]}
        />
      </Modal>

      {/* Delete zone modal */}
      <Modal
        open={deleteZoneOpen}
        title="Delete hosted zone?"
        onClose={() => setDeleteZoneOpen(false)}
        footer={
          <>
            <AwsButton onClick={() => setDeleteZoneOpen(false)}>Cancel</AwsButton>
            <AwsButton variant="primary" onClick={doDeleteZone}>
              Delete
            </AwsButton>
          </>
        }
      >
        <p>
          Permanently delete <b>{zoneName}</b> and all of its records? This action cannot be undone.
        </p>
      </Modal>
    </AppShell>
  );
}

function matchLabel(n: number) {
  return `${n} ${n === 1 ? "match" : "matches"}`;
}

/**
 * Filter dropdown. Once a value is chosen the placeholder option disappears from the list —
 * removal happens via the applied-filter tokens below the filter row, as in the console.
 */
function FilterSelect({
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
    <div style={{ width }}>
      <Select
        selectedOption={value ? { value, label: value } : null}
        placeholder={placeholder}
        ariaLabel={`Filter by ${placeholder.toLowerCase()}`}
        options={options.map((o) => ({ value: o, label: o }))}
        onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
        expandToViewport
      />
    </div>
  );
}

/** Value with a copy-to-clipboard affordance, used in the split panel. */
function Copyable({ text }: { text: string }) {
  return (
    <CopyToClipboard
      variant="inline"
      textToCopy={text}
      copyButtonAriaLabel={`Copy ${text}`}
      copySuccessText="Copied to clipboard"
      copyErrorText="Failed to copy"
    />
  );
}

/**
 * Honest placeholder for the hosted-zone tabs this clone doesn't implement: the real
 * feature is described, then the panel says so instead of offering a dead button.
 */
function ComingSoonPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Container header={<Header variant="h2">{title}</Header>}>
      <Box textAlign="center" padding={{ vertical: "xxl" }}>
        <SpaceBetween size="s">
          <Box variant="h3" color="inherit">
            Coming soon
          </Box>
          <Box variant="p" color="text-body-secondary">
            {children}
          </Box>
        </SpaceBetween>
      </Box>
    </Container>
  );
}
