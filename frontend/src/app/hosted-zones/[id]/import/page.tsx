"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FileUpload from "@cloudscape-design/components/file-upload";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Textarea from "@cloudscape-design/components/textarea";
import { AppShell } from "@/components/layout/AppShell";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { RECORD_TYPES, type HostedZone } from "@/types";

/** Route 53 refuses an import of more than this many record sets. */
const MAX_RECORDS = 1000;
const PAGE_SIZE = 10;

const CLASSES = new Set(["IN", "CH", "HS", "CS"]);
const SUPPORTED_TYPES = new Set<string>(RECORD_TYPES);

const display = (name: string) => name.replace(/\.$/, "");

type PreviewRow = { name: string; type: string; ttl: number; value: string };
type ParseResult = { records: PreviewRow[]; warnings: string[] };

/** Drop a trailing `;` comment, ignoring semicolons inside quoted strings (TXT rdata). */
function stripComment(line: string): string {
  let out = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === ";" && !inQuote) break;
    out += ch;
  }
  return out;
}

/**
 * RFC 1035 master-file parser for the live preview. It mirrors the backend's
 * `bind_parser.parse_zone_file` and the import route's skip rules, so the table shows
 * exactly the record sets that Import will create — not just the lines in the file.
 */
function parseZoneFile(text: string, zoneName: string): ParseResult {
  let origin = zoneName.endsWith(".") ? zoneName : `${zoneName}.`;
  let ttlDefault = 300;
  const warnings: string[] = [];

  // Fold parenthesised multi-line records into one logical line. The leading whitespace of
  // the *first* physical line is kept because it means "reuse the previous owner name".
  const logical: { text: string; inherits: boolean }[] = [];
  let buffer = "";
  let inherits = false;
  let depth = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line.trim() && depth === 0) continue;
    depth += (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0);
    const cleaned = line.replace(/[()]/g, " ");
    if (buffer) {
      buffer += ` ${cleaned}`;
    } else {
      inherits = /^\s/.test(cleaned);
      buffer = cleaned;
    }
    if (depth <= 0) {
      logical.push({ text: buffer.trim(), inherits });
      buffer = "";
      depth = 0;
    }
  }
  if (buffer.trim()) logical.push({ text: buffer.trim(), inherits });

  const qualify = (n: string) => (n === "@" ? origin : n.endsWith(".") ? n : `${n}.${origin}`);

  const grouped = new Map<string, PreviewRow & { values: string[] }>();
  const order: string[] = [];
  let lastName = origin;

  for (const line of logical) {
    if (!line.text) continue;

    if (/^\$ORIGIN\b/i.test(line.text)) {
      const parts = line.text.split(/\s+/);
      if (parts[1]) origin = parts[1].endsWith(".") ? parts[1] : `${parts[1]}.`;
      continue;
    }
    if (/^\$TTL\b/i.test(line.text)) {
      const parts = line.text.split(/\s+/);
      if (/^\d+$/.test(parts[1] ?? "")) ttlDefault = Number(parts[1]);
      continue;
    }

    const tokens = line.text.split(/\s+/);
    const name = line.inherits ? lastName : qualify(tokens.shift() ?? "@");
    lastName = name;

    // TTL and class may appear in either order, and both are optional.
    let ttl = ttlDefault;
    while (tokens.length && (/^\d+$/.test(tokens[0]) || CLASSES.has(tokens[0].toUpperCase()))) {
      const token = tokens.shift() as string;
      if (/^\d+$/.test(token)) ttl = Number(token);
    }
    if (!tokens.length) {
      warnings.push(`Skipped line (no record type): ${line.text}`);
      continue;
    }

    const type = (tokens.shift() as string).toUpperCase();
    const value = tokens.join(" ").trim();
    if (!value) {
      warnings.push(`Skipped ${type} record for ${display(name)} (no value)`);
      continue;
    }
    if (type === "SOA" || (type === "NS" && name === origin)) {
      warnings.push(
        `Ignored the ${type} record for ${display(name)}. Route 53 manages the SOA record and the NS record that has the same name as the hosted zone.`
      );
      continue;
    }
    if (!SUPPORTED_TYPES.has(type)) {
      warnings.push(`Skipped unsupported record type ${type} for ${display(name)}`);
      continue;
    }

    const key = `${name}|${type}`;
    let group = grouped.get(key);
    if (!group) {
      group = { name, type, ttl, value: "", values: [] };
      grouped.set(key, group);
      order.push(key);
    }
    group.values.push(value);
    group.ttl = Math.min(group.ttl, ttl); // smallest TTL wins for a record set
  }

  const records = order.map((key) => {
    const group = grouped.get(key) as PreviewRow & { values: string[] };
    return { name: group.name, type: group.type, ttl: group.ttl, value: group.values.join("\n") };
  });
  return { records, warnings };
}

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<PreviewRow>[] = [
  {
    id: "name",
    header: "Record name",
    sortingField: "name",
    width: 280,
    minWidth: 160,
    cell: (r) => display(r.name),
  },
  { id: "type", header: "Type", sortingField: "type", width: 120, minWidth: 90, cell: (r) => r.type },
  {
    id: "value",
    header: "Value/Route traffic to",
    sortingField: "value",
    minWidth: 200,
    cell: (r) => (
      <SpaceBetween size="xxxs">
        {r.value.split("\n").map((v, i) => (
          <span key={i}>{v}</span>
        ))}
      </SpaceBetween>
    ),
  },
  { id: "ttl", header: "TTL (seconds)", sortingField: "ttl", width: 160, minWidth: 110, cell: (r) => r.ttl },
];

export default function ImportZonePage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

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

  const { records, warnings } = useMemo(
    () => (zoneName ? parseZoneFile(text, zoneName) : { records: [], warnings: [] }),
    [text, zoneName]
  );

  // Route 53 rejects the whole file for these, so they block Import rather than warn.
  const blockingError = useMemo(() => {
    if (!text.trim()) return "Paste the contents of your zone file.";
    if (/^\s*\$(GENERATE|INCLUDE)\b/im.test(text)) {
      return "Route 53 doesn't support the $GENERATE and $INCLUDE keywords. Remove them and try again.";
    }
    if (records.length === 0) {
      return "This zone file doesn't contain any records that Route 53 can create. The zone file must be in RFC-compliant format.";
    }
    if (records.length > MAX_RECORDS) {
      return `You can import a maximum of ${MAX_RECORDS} records. This zone file contains ${records.length}.`;
    }
    return undefined;
  }, [text, records.length]);

  const zoneFileError = submitted ? blockingError : undefined;

  const { items, collectionProps, filterProps, filteredItemsCount, paginationProps } = useCollection(
    records,
    {
      filtering: {
        empty: (
          <Box textAlign="center" color="inherit" padding={{ vertical: "l" }}>
            This table displays records based on the contents of your zone file.
          </Box>
        ),
        noMatch: (
          <Box textAlign="center" color="inherit" padding={{ vertical: "l" }}>
            No records match your filter.
          </Box>
        ),
        fields: ["name", "type", "value"],
      },
      pagination: { pageSize: PAGE_SIZE },
      sorting: { defaultState: { sortingColumn: COLUMN_DEFINITIONS[0] } },
    }
  );

  const onFilesChange = async (next: File[]) => {
    setFiles(next);
    setFileError(undefined);
    const file = next[0];
    if (!file) return;
    try {
      setText(await file.text());
      setSubmitted(false);
      setImportWarnings([]);
    } catch {
      setFileError("Couldn't read this file. Paste the zone file contents instead.");
    }
  };

  const doImport = async () => {
    setSubmitted(true);
    setImportWarnings([]);
    if (blockingError) return;

    setImporting(true);
    try {
      const res = await recordService.importZone(zoneId, text);
      const parts = [`${res.created} created`, `${res.updated} updated`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      notify({ type: "success", content: `Zone file imported — ${parts.join(", ")}.` });
      // Stay on the page when the import reported problems so the user can read them.
      if (res.errors.length > 0) {
        setImportWarnings(res.errors);
        setImporting(false);
        return;
      }
      router.push(recordsHref);
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to import zone file") });
      setImporting(false);
    }
  };

  return (
    <AppShell
      contentType="form"
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: display(zoneName) || "…", href: recordsHref },
        { label: "Import zone file" },
      ]}
    >
      <Form
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            description="You can create records for a Route 53 hosted zone by importing a zone file."
          >
            Import zone file
          </Header>
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" disabled={importing} onClick={() => router.push(recordsHref)}>
              Cancel
            </Button>
            <Button variant="primary" loading={importing} onClick={doImport}>
              Import
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container
            header={
              <Header variant="h2" description="Paste the contents of your zone file below.">
                Zone file
              </Header>
            }
          >
            <SpaceBetween size="l">
              <FormField
                stretch
                errorText={zoneFileError}
                constraintText="If the hosted zone already contains records that appear in the zone file, the import process fails, and no records are created. Enter multiple records on separate lines."
              >
                <Textarea
                  value={text}
                  onChange={({ detail }) => {
                    setText(detail.value);
                    setImportWarnings([]);
                  }}
                  rows={10}
                  spellcheck={false}
                  disableBrowserAutocorrect
                  invalid={!!zoneFileError}
                  placeholder={"subdomain1 0s A 10.0.0.0\nsubdomain2 0s CNAME example.com."}
                  ariaLabel="Zone file"
                />
              </FormField>

              <FormField
                label={
                  <>
                    Load from a file <i>- optional</i>
                  </>
                }
                description="Choose a zone file exported from your current DNS provider to fill in the text box above."
                constraintText="Plain-text BIND zone files only (.txt, .zone, .db)."
                errorText={fileError}
              >
                <FileUpload
                  value={files}
                  onChange={({ detail }) => void onFilesChange(detail.value)}
                  accept=".txt,.zone,.db,text/plain"
                  showFileSize
                  tokenLimit={1}
                  i18nStrings={{
                    uploadButtonText: () => "Choose file",
                    dropzoneText: () => "Drop a zone file to upload",
                    removeFileAriaLabel: (i) => `Remove file ${i + 1}`,
                    errorIconAriaLabel: "Error",
                  }}
                />
              </FormField>
            </SpaceBetween>
          </Container>

          {importWarnings.length > 0 && (
            <Alert type="warning" statusIconAriaLabel="Warning" header="Some records were not imported">
              <ul>
                {importWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Table<PreviewRow>
            {...collectionProps}
            variant="container"
            items={items}
            columnDefinitions={COLUMN_DEFINITIONS}
            trackBy={(r) => `${r.name}|${r.type}`}
            resizableColumns
            wrapLines
            header={
              <Header
                variant="h2"
                counter={`(${records.length})`}
                description="Route 53 creates the following records when you choose Import zone file. If you edit the contents of the zone file above, the table reflects your changes."
              >
                {`Record preview for ${display(zoneName) || "this hosted zone"}`}
              </Header>
            }
            filter={
              <TextFilter
                {...filterProps}
                filteringPlaceholder="Filter records by property or value"
                filteringAriaLabel="Filter records"
                countText={
                  filterProps.filteringText
                    ? `${filteredItemsCount ?? 0} ${filteredItemsCount === 1 ? "match" : "matches"}`
                    : ""
                }
              />
            }
            pagination={<Pagination {...paginationProps} />}
          />

          {/* Below the table so an in-progress edit doesn't shove the preview around. */}
          {warnings.length > 0 && (
            <Alert
              type="warning"
              statusIconAriaLabel="Warning"
              header={`${warnings.length} line${warnings.length === 1 ? "" : "s"} in this zone file won't be imported`}
            >
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
        </SpaceBetween>
      </Form>
    </AppShell>
  );
}
