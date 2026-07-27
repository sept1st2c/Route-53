"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";
import { AppShell } from "@/components/layout/AppShell";
import { zoneService, recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import {
  ENDPOINT_REQUIRED_ERROR,
  RECORD_TYPE_OPTIONS,
  REGION_REQUIRED_ERROR,
  ROUTING_POLICY_OPTIONS,
  TTL_CONSTRAINT_TEXT,
  TTL_PRESETS,
  recordTypeOption,
  validateRecordName,
  validateRecordValue,
  validateTtl,
} from "@/lib/dnsValidation";
import type { DNSRecord, HostedZone, RecordType } from "@/types";

const TYPE_OPTIONS = RECORD_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const POLICY_OPTIONS = ROUTING_POLICY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/**
 * Alias targets the console offers under "Route traffic to". The endpoints are mocked, but only the
 * regional ones ask for a Region — CloudFront, Global Accelerator and in-zone records are global.
 */
const ALIAS_ENDPOINTS = [
  { value: "apigateway", label: "Alias to API Gateway API", regional: true },
  { value: "elb", label: "Alias to Application and Classic Load Balancer", regional: true },
  { value: "cloudfront", label: "Alias to CloudFront distribution", regional: false },
  { value: "beanstalk", label: "Alias to Elastic Beanstalk environment", regional: true },
  { value: "globalaccelerator", label: "Alias to Global Accelerator", regional: false },
  { value: "nlb", label: "Alias to Network Load Balancer", regional: true },
  { value: "s3", label: "Alias to S3 website endpoint", regional: true },
  { value: "vpce", label: "Alias to VPC endpoint", regional: true },
  { value: "record", label: "Alias to another record in this hosted zone", regional: false },
];

/** Regions Route 53 accepts for a latency/alias target (API_ResourceRecordSet Region valid values). */
const REGIONS: { code: string; name: string }[] = [
  { code: "us-east-1", name: "US East (N. Virginia)" },
  { code: "us-east-2", name: "US East (Ohio)" },
  { code: "us-west-1", name: "US West (N. California)" },
  { code: "us-west-2", name: "US West (Oregon)" },
  { code: "af-south-1", name: "Africa (Cape Town)" },
  { code: "ap-east-1", name: "Asia Pacific (Hong Kong)" },
  { code: "ap-south-1", name: "Asia Pacific (Mumbai)" },
  { code: "ap-south-2", name: "Asia Pacific (Hyderabad)" },
  { code: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-2", name: "Asia Pacific (Seoul)" },
  { code: "ap-northeast-3", name: "Asia Pacific (Osaka)" },
  { code: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
  { code: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
  { code: "ap-southeast-3", name: "Asia Pacific (Jakarta)" },
  { code: "ap-southeast-4", name: "Asia Pacific (Melbourne)" },
  { code: "ca-central-1", name: "Canada (Central)" },
  { code: "ca-west-1", name: "Canada West (Calgary)" },
  { code: "eu-central-1", name: "Europe (Frankfurt)" },
  { code: "eu-central-2", name: "Europe (Zurich)" },
  { code: "eu-west-1", name: "Europe (Ireland)" },
  { code: "eu-west-2", name: "Europe (London)" },
  { code: "eu-west-3", name: "Europe (Paris)" },
  { code: "eu-north-1", name: "Europe (Stockholm)" },
  { code: "eu-south-1", name: "Europe (Milan)" },
  { code: "eu-south-2", name: "Europe (Spain)" },
  { code: "il-central-1", name: "Israel (Tel Aviv)" },
  { code: "me-central-1", name: "Middle East (UAE)" },
  { code: "me-south-1", name: "Middle East (Bahrain)" },
  { code: "mx-central-1", name: "Mexico (Central)" },
  { code: "sa-east-1", name: "South America (São Paulo)" },
];

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r.code, label: r.name, description: r.code }));

type Block = {
  key: number;
  sub: string;
  type: RecordType;
  value: string;
  ttl: string;
  policy: string;
  alias: boolean;
  endpoint: string;
  region: string;
  evaluateTargetHealth: boolean;
  /** Errors stay hidden until this block has been through a submit attempt. */
  submitted: boolean;
};

type BlockErrors = { name?: string; value?: string; ttl?: string; endpoint?: string; region?: string };

let counter = 1;
const newBlock = (): Block => ({
  key: counter++,
  sub: "",
  type: "A",
  value: "",
  ttl: "300",
  policy: "Simple",
  alias: false,
  endpoint: "",
  region: "",
  evaluateTargetHealth: false,
  submitted: false,
});

const isRegional = (endpoint: string) => ALIAS_ENDPOINTS.find((e) => e.value === endpoint)?.regional ?? false;

function validateBlock(b: Block, zone: string): BlockErrors {
  const errors: BlockErrors = {};
  const name = validateRecordName(b.sub, zone, b.type);
  if (name) errors.name = name;

  if (b.alias) {
    if (!b.endpoint) errors.endpoint = ENDPOINT_REQUIRED_ERROR;
    if (isRegional(b.endpoint) && !b.region) errors.region = REGION_REQUIRED_ERROR;
    return errors;
  }

  const value = validateRecordValue(b.type, b.value);
  if (value) errors.value = value;
  const ttl = validateTtl(b.ttl);
  if (ttl) errors.ttl = ttl;
  return errors;
}

/** Route 53 stores the resolved alias target as the record's value; ours records what was chosen. */
function aliasTarget(b: Block): string {
  const label = ALIAS_ENDPOINTS.find((e) => e.value === b.endpoint)?.label ?? "Alias";
  return isRegional(b.endpoint) ? `${label} (${b.region})` : label;
}

export default function CreateRecordPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([newBlock()]);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

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
    setSubmitError("");
    setBlocks((bs) => bs.map((b) => ({ ...b, submitted: true })));
    if (blocks.some((b) => Object.keys(validateBlock(b, zoneNoDot)).length > 0)) return;

    setSaving(true);
    try {
      for (const b of blocks) {
        const name = b.sub.trim() ? `${b.sub.trim()}.${zoneNoDot}` : zoneNoDot;
        await recordService.create(zoneId, {
          name,
          type: b.type,
          value: b.alias ? aliasTarget(b) : b.value.trim(),
          // Alias records inherit the target's TTL, so Route 53 stores none of their own.
          ttl: b.alias ? null : Number(b.ttl),
          routing_policy: b.policy,
        });
      }
      notify({ type: "success", content: `Created ${blocks.length} record${blocks.length > 1 ? "s" : ""}.` });
      router.push(recordsHref);
    } catch (e) {
      setSubmitError(apiError(e, "Failed to create record"));
      setSaving(false);
    }
  };

  const info = <Link variant="info">Info</Link>;

  return (
    <AppShell
      contentType="form"
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneNoDot || "…", href: recordsHref },
        { label: "Create record" },
      ]}
    >
      <SpaceBetween size="l">
        <Form
          header={
            <Header variant="h1" info={info}>
              Create record
            </Header>
          }
          errorText={submitError || undefined}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" formAction="none" disabled={saving} onClick={() => router.push(recordsHref)}>
                Cancel
              </Button>
              <Button variant="primary" formAction="none" loading={saving} onClick={submit}>
                Create records
              </Button>
            </SpaceBetween>
          }
        >
          <Container
            header={
              <Header
                variant="h2"
                actions={
                  <Link variant="primary" onFollow={(e) => e.preventDefault()}>
                    Switch to wizard
                  </Link>
                }
              >
                Quick create record
              </Header>
            }
            footer={
              <Box textAlign="right">
                <Button formAction="none" onClick={addBlock}>
                  Add another record
                </Button>
              </Box>
            }
          >
            <SpaceBetween size="l">
              {blocks.map((b, i) => {
                const errors = b.submitted ? validateBlock(b, zoneNoDot) : {};
                const set = (patch: Partial<Block>) => setField(b.key, patch);
                return (
                  <ExpandableSection
                    key={b.key}
                    defaultExpanded
                    headingTagOverride="h3"
                    headerText={`Record ${i + 1}`}
                    headerActions={
                      <Button formAction="none" disabled={blocks.length === 1} onClick={() => removeBlock(b.key)}>
                        Delete
                      </Button>
                    }
                  >
                    <SpaceBetween size="l">
                      <ColumnLayout columns={2}>
                        <SpaceBetween size="m">
                          <FormField
                            label="Record name"
                            info={info}
                            constraintText="Keep blank to create a record for the root domain."
                            errorText={errors.name}
                          >
                            {/* Suffix shares the control row with the input, as the console renders it. */}
                            <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
                              <Input
                                value={b.sub}
                                placeholder="subdomain"
                                onChange={({ detail }) => set({ sub: detail.value })}
                              />
                              <Box padding={{ top: "xxs" }}>{zoneNoDot}</Box>
                            </Grid>
                          </FormField>
                          <Toggle checked={b.alias} onChange={({ detail }) => set({ alias: detail.checked })}>
                            Alias
                          </Toggle>
                        </SpaceBetween>

                        <FormField label="Record type" info={info}>
                          <Select
                            selectedOption={TYPE_OPTIONS.find((o) => o.value === b.type) ?? null}
                            options={TYPE_OPTIONS}
                            onChange={({ detail }) => set({ type: detail.selectedOption.value as RecordType })}
                          />
                        </FormField>
                      </ColumnLayout>

                      {b.alias ? (
                        <ColumnLayout columns={2}>
                          <FormField label="Route traffic to" info={info} errorText={errors.endpoint}>
                            <Select
                              placeholder="Choose endpoint"
                              selectedOption={ALIAS_ENDPOINTS.find((o) => o.value === b.endpoint) ?? null}
                              options={ALIAS_ENDPOINTS.map((o) => ({ value: o.value, label: o.label }))}
                              onChange={({ detail }) =>
                                set({ endpoint: detail.selectedOption.value ?? "", region: "" })
                              }
                            />
                          </FormField>
                          <FormField
                            label="Region"
                            info={info}
                            errorText={errors.region}
                            constraintText={
                              b.endpoint && !isRegional(b.endpoint) ? "This endpoint type is global." : undefined
                            }
                          >
                            <Select
                              placeholder="Choose Region"
                              disabled={!isRegional(b.endpoint)}
                              filteringType="auto"
                              selectedOption={REGION_OPTIONS.find((o) => o.value === b.region) ?? null}
                              options={REGION_OPTIONS}
                              onChange={({ detail }) => set({ region: detail.selectedOption.value ?? "" })}
                            />
                          </FormField>
                        </ColumnLayout>
                      ) : (
                        <FormField
                          label="Value"
                          info={info}
                          constraintText="Enter multiple values on separate lines."
                          errorText={errors.value}
                          stretch
                        >
                          <Textarea
                            rows={4}
                            value={b.value}
                            placeholder={recordTypeOption(b.type)?.placeholder}
                            onChange={({ detail }) => set({ value: detail.value })}
                          />
                        </FormField>
                      )}

                      {b.alias && (
                        <Toggle
                          checked={b.evaluateTargetHealth}
                          onChange={({ detail }) => set({ evaluateTargetHealth: detail.checked })}
                        >
                          Evaluate target health
                        </Toggle>
                      )}

                      <ColumnLayout columns={2}>
                        {b.alias ? (
                          <Box />
                        ) : (
                          <FormField
                            label="TTL (seconds)"
                            info={info}
                            constraintText={TTL_CONSTRAINT_TEXT}
                            errorText={errors.ttl}
                          >
                            {/* Quick-set chips share the control row with the input, as the console renders it. */}
                            <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={b.ttl}
                                onChange={({ detail }) => set({ ttl: detail.value })}
                              />
                              <SpaceBetween direction="horizontal" size="xs">
                                {TTL_PRESETS.map((p) => (
                                  <Button
                                    key={p.label}
                                    formAction="none"
                                    onClick={() => set({ ttl: String(p.seconds) })}
                                  >
                                    {p.label}
                                  </Button>
                                ))}
                              </SpaceBetween>
                            </Grid>
                          </FormField>
                        )}

                        <FormField label="Routing policy" info={info}>
                          <Select
                            selectedOption={POLICY_OPTIONS.find((o) => o.value === b.policy) ?? null}
                            options={POLICY_OPTIONS}
                            onChange={({ detail }) => set({ policy: detail.selectedOption.value ?? "Simple" })}
                          />
                        </FormField>
                      </ColumnLayout>
                    </SpaceBetween>
                  </ExpandableSection>
                );
              })}
            </SpaceBetween>
          </Container>
        </Form>

        <ExpandableSection
          headingTagOverride="h3"
          headerText="View existing records"
          headerDescription={`The following table lists the existing records in ${zoneNoDot}.`}
        >
          <ExistingRecords zoneId={zoneId} />
        </ExpandableSection>
      </SpaceBetween>
    </AppShell>
  );
}

function ExistingRecords({ zoneId }: { zoneId: number }) {
  const [items, setItems] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordService
      .list(zoneId, { limit: 100 })
      .then((d) => setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [zoneId]);

  return (
    <Table
      variant="embedded"
      loading={loading}
      loadingText="Loading records"
      items={items}
      empty={
        <Box textAlign="center" color="inherit" padding={{ vertical: "s" }}>
          No records
        </Box>
      }
      columnDefinitions={[
        { id: "name", header: "Record name", cell: (r: DNSRecord) => r.name },
        { id: "type", header: "Type", cell: (r: DNSRecord) => r.type },
        { id: "policy", header: "Routing policy", cell: (r: DNSRecord) => r.routing_policy || "Simple" },
        { id: "alias", header: "Alias", cell: (r: DNSRecord) => (r.ttl === null ? "Yes" : "No") },
        {
          id: "value",
          header: "Value/Route traffic to",
          cell: (r: DNSRecord) => (
            <Box variant="span">
              {r.value.split("\n").map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </Box>
          ),
        },
        { id: "ttl", header: "TTL (seconds)", cell: (r: DNSRecord) => r.ttl ?? "-" },
      ]}
    />
  );
}
