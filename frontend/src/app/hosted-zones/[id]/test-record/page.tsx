"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { AppShell } from "@/components/layout/AppShell";
import { recordService, zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { RECORD_TYPES, type DNSRecord, type HostedZone } from "@/types";

const TYPE_DESCRIPTIONS: Record<string, string> = {
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

const TYPE_OPTIONS: SelectProps.Option[] = RECORD_TYPES.map((t) => ({
  value: t,
  label: TYPE_DESCRIPTIONS[t] ? `${t} – ${TYPE_DESCRIPTIONS[t]}` : t,
}));

/** The backend caps `limit` at 100, so the whole zone is walked a page at a time. */
const RECORDS_PAGE_SIZE = 100;
const MAX_RECORD_PAGES = 20;

const IPV4 = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 = /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(:[0-9a-f]{1,4}){1,6}|:((:[0-9a-f]{1,4}){1,7}|:))$/i;
/** A relative owner name: one or more DNS labels, optionally a leading wildcard. */
const OWNER_NAME = /^(\*|_?[a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.(_?[a-z0-9]([a-z0-9-]*[a-z0-9])?))*$/i;

const isIp = (v: string) => IPV4.test(v) || IPV6.test(v);
const normalize = (name: string) => name.replace(/\.$/, "").toLowerCase();

type ResponseCode = "NOERROR" | "NXDOMAIN";

type TestResponse = {
  recordName: string;
  recordType: string;
  responseCode: ResponseCode;
  /** Empty when the name exists but carries no record of the requested type (NODATA). */
  recordData: string[];
  protocol: "UDP";
};

/** Pull every record in the zone so a query can be resolved locally, name and type. */
async function fetchAllRecords(zoneId: number): Promise<DNSRecord[]> {
  const all: DNSRecord[] = [];
  for (let page = 1; page <= MAX_RECORD_PAGES; page++) {
    const data = await recordService.list(zoneId, { page, limit: RECORDS_PAGE_SIZE });
    all.push(...data.items);
    if (page >= data.pages) break;
  }
  return all;
}

export default function TestRecordPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [recordName, setRecordName] = useState("");
  const [type, setType] = useState<SelectProps.Option>(TYPE_OPTIONS[0]);
  const [resolverIp, setResolverIp] = useState("");
  const [ednsIp, setEdnsIp] = useState("");
  const [subnetMask, setSubnetMask] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TestResponse | null>(null);

  useEffect(() => {
    zoneService
      .get(zoneId)
      .then(setZone)
      .catch((e) => notify({ type: "error", content: apiError(e, "Failed to load hosted zone") }));
  }, [zoneId, notify]);

  const zoneName = zone ? zone.name.replace(/\.$/, "") : "…";
  const recordsHref = `/hosted-zones/${zoneId}/records`;

  const errors = useMemo(() => {
    const name = recordName.trim();
    const resolver = resolverIp.trim();
    const edns = ednsIp.trim();
    const mask = subnetMask.trim();

    const out: { recordName?: string; resolverIp?: string; ednsIp?: string; subnetMask?: string } = {};

    if (name) {
      if (name.endsWith(".")) {
        out.recordName = "Enter the subdomain name excluding the domain name, without a trailing dot.";
      } else if (!OWNER_NAME.test(name)) {
        out.recordName = "Enter a valid subdomain name, for example www or www.dev.";
      } else if (`${name}.${zoneName}`.length > 1024) {
        out.recordName = "The record name can have up to 1024 characters.";
      }
    }
    if (resolver && !isIp(resolver)) {
      out.resolverIp = "Enter a valid IPv4 or IPv6 address, for example 192.0.2.25.";
    }
    if (edns && !isIp(edns)) {
      out.ednsIp = "Enter a valid IPv4 or IPv6 address, for example 192.0.2.0.";
    }
    if (mask) {
      if (!edns) {
        out.subnetMask = "Specify an EDNS0 client subnet IP before you specify a subnet mask.";
      } else if (!/^\d{1,3}$/.test(mask)) {
        out.subnetMask = "Enter the number of bits to include in the DNS query.";
      } else {
        // Route 53 allows 0–32 bits for IPv4 and 0–128 for IPv6.
        const max = IPV4.test(edns) ? 32 : 128;
        if (Number(mask) > max) out.subnetMask = `Specify a value between 0 and ${max}.`;
      }
    }
    return out;
  }, [recordName, resolverIp, ednsIp, subnetMask, zoneName]);

  const hasErrors = Object.keys(errors).length > 0;
  const shown = submitted ? errors : {};

  const getResponse = async () => {
    setSubmitted(true);
    if (!zone || hasErrors) return;

    const queried = recordName.trim() ? `${recordName.trim()}.${zoneName}` : zoneName;
    const recordType = String(type.value);

    setLoading(true);
    setResponse(null);
    try {
      const records = await fetchAllRecords(zoneId);
      const sameName = records.filter((r) => normalize(r.name) === normalize(queried));
      const match = sameName.find((r) => r.type === recordType);
      setResponse({
        recordName: `${queried}.`,
        recordType,
        // A name that exists without the requested type is NODATA — still NOERROR in DNS.
        responseCode: sameName.length > 0 ? "NOERROR" : "NXDOMAIN",
        recordData: match ? match.value.split("\n").filter(Boolean) : [],
        protocol: "UDP",
      });
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to get a response for this record") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      contentType="form"
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneName, href: recordsHref },
        { label: "Test record" },
      ]}
    >
      <Form
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            description="Test records to simulate the values that Route 53 returns in response to DNS queries. This tool displays the standard values that Route 53 provides based on the settings in the hosted zone. The tool doesn't send actual DNS queries."
          >
            Test record
          </Header>
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" disabled={loading} onClick={() => router.push(recordsHref)}>
              Cancel
            </Button>
            <Button variant="primary" loading={loading} disabled={!zone} onClick={getResponse}>
              Get response
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Record to test</Header>}>
            <SpaceBetween size="l">
              <KeyValuePairs items={[{ label: "Hosted zone", value: zoneName }]} />

              <FormField
                label={
                  <>
                    Record name <i>- optional</i>
                  </>
                }
                info={<Link variant="info">Info</Link>}
                description={`To check a record that has the same name as the hosted zone ${zoneName}, leave this field blank. To check the record for a subdomain, enter the subdomain name excluding the domain name.`}
                errorText={shown.recordName}
              >
                <Input
                  type="search"
                  value={recordName}
                  onChange={({ detail }) => setRecordName(detail.value)}
                  placeholder="www"
                  invalid={!!shown.recordName}
                  disableBrowserAutocorrect
                />
              </FormField>

              <FormField
                label="Record type"
                info={<Link variant="info">Info</Link>}
                description="The DNS type of the record determines the format of the value that Route 53 returns in response to DNS queries."
              >
                <Select
                  selectedOption={type}
                  options={TYPE_OPTIONS}
                  onChange={({ detail }) => setType(detail.selectedOption)}
                  selectedAriaLabel="Selected"
                />
              </FormField>
            </SpaceBetween>
          </Container>

          <Container
            header={
              <Header
                variant="h2"
                description="Simulate the response that Route 53 returns to a specific IP address. This is useful for testing geolocation and latency records."
              >
                Settings to simulate DNS queries <i>- optional</i>
              </Header>
            }
          >
            <SpaceBetween size="l">
              <FormField
                label="Resolver IP address"
                info={<Link variant="info">Info</Link>}
                description="The IP address that the tool uses to simulate the location of the DNS resolver that a client uses to make requests. If you omit this value, the tool uses the IP address of a DNS resolver in the AWS US East (N. Virginia) Region."
                errorText={shown.resolverIp}
              >
                <Input
                  value={resolverIp}
                  onChange={({ detail }) => setResolverIp(detail.value)}
                  placeholder="192.0.2.25"
                  invalid={!!shown.resolverIp}
                  disableBrowserAutocorrect
                />
              </FormField>

              <ExpandableSection headerText="Additional configuration">
                <SpaceBetween size="l">
                  <Box variant="small">
                    If the resolver supports EDNS0, specify an IP address and subnet mask for the client.
                  </Box>

                  <FormField
                    label="EDNS0 client subnet IP"
                    info={<Link variant="info">Info</Link>}
                    description="The client subnet IP for an IP address in the applicable location. For example, 192.0.2.0."
                    errorText={shown.ednsIp}
                  >
                    <Input
                      value={ednsIp}
                      onChange={({ detail }) => setEdnsIp(detail.value)}
                      placeholder="192.0.2.0"
                      invalid={!!shown.ednsIp}
                      disableBrowserAutocorrect
                    />
                  </FormField>

                  <FormField
                    label={
                      <>
                        Subnet mask <i>- optional</i>
                      </>
                    }
                    info={<Link variant="info">Info</Link>}
                    description="If you specified a value for EDNS0 client subnet IP, optionally enter the number of bits in the IP address that you want to include in the DNS requests. For example, if you specify 192.0.2.44 for EDNS0 client subnet IP and 24 for Subnet mask, this tool will simulate a request from 192.0.2.0/24. The default value is 24 bits for IPv4 addresses and 64 bits for IPv6 addresses."
                    errorText={shown.subnetMask}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={subnetMask}
                      onChange={({ detail }) => setSubnetMask(detail.value)}
                      placeholder="24"
                      invalid={!!shown.subnetMask}
                    />
                  </FormField>
                </SpaceBetween>
              </ExpandableSection>
            </SpaceBetween>
          </Container>

          {response && (
            <Container header={<Header variant="h2">Response returned by Route 53</Header>}>
              <KeyValuePairs
                columns={2}
                items={[
                  { label: "Record name", value: response.recordName },
                  { label: "Record type", value: response.recordType },
                  {
                    label: "DNS response code",
                    value:
                      response.responseCode === "NOERROR" ? (
                        <StatusIndicator type="success">NOERROR</StatusIndicator>
                      ) : (
                        <StatusIndicator type="error">NXDOMAIN</StatusIndicator>
                      ),
                  },
                  { label: "Protocol", value: response.protocol },
                  {
                    label: "Value returned",
                    value:
                      response.recordData.length > 0 ? (
                        <SpaceBetween size="xxxs">
                          {response.recordData.map((v, i) => (
                            <span key={i}>{v}</span>
                          ))}
                        </SpaceBetween>
                      ) : (
                        <Box color="text-status-inactive">
                          {response.responseCode === "NXDOMAIN"
                            ? "This hosted zone has no record with this name."
                            : `This name exists in the hosted zone, but it has no ${response.recordType} record.`}
                        </Box>
                      ),
                  },
                ]}
              />
            </Container>
          )}
        </SpaceBetween>
      </Form>
    </AppShell>
  );
}
