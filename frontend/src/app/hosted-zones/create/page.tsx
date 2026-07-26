"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Tiles from "@cloudscape-design/components/tiles";
import { AppShell } from "@/components/layout/AppShell";
import { TagEditor, type Tag } from "@/components/ui/TagEditor";
import { zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { ZoneType } from "@/types";

const INFO = <Link variant="info">Info</Link>;

// The constraint string the Route 53 console prints under Domain name, character for character.
const VALID_CHARACTERS =
  "Valid characters: a-z, 0-9, ! \" # $ % & ' ( ) * + , - / : ; < = > ? @ [ \\ ] ^ _ ` { | } . ~";

const MAX_DESCRIPTION = 256;

/** Printable ASCII Route 53 accepts in hosted zone names (DNS domain name format). */
const LEGAL_CHARACTERS = /^[a-zA-Z0-9!"#$%&'()*+,\-/:;<=>?@[\\\]^_`{|}~.]+$/;

// Route 53 measures domain names in bytes, not code units.
const byteLength = (value: string) => new TextEncoder().encode(value).length;

function validateDomainName(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Enter a domain name.";
  if (!LEGAL_CHARACTERS.test(value)) {
    return "The domain name contains characters that Route 53 doesn't allow. Specify other characters as escape codes in the format \\ followed by a three-digit octal code, or convert an internationalized domain name to Punycode.";
  }
  if (byteLength(value) > 255) {
    return "The total length of a domain name can't exceed 255 bytes, including the dots.";
  }
  // A single trailing dot is the DNS root separator, not an empty label.
  const labels = value.replace(/\.$/, "").split(".");
  if (labels.some((label) => label.length === 0)) {
    return "The domain name can't contain an empty label. Remove any leading or consecutive dots.";
  }
  if (labels.some((label) => byteLength(label) > 63)) {
    return "Each label in a domain name can be up to 63 bytes long.";
  }
  if (labels.length < 2) {
    return "Route 53 doesn't support hosting top-level domains such as .com. Enter a domain or subdomain name, for example example.com.";
  }
  if (labels[0].includes("*")) {
    return "You can't include an * in the leftmost label of a hosted zone name.";
  }
  return undefined;
}

function validateDescription(value: string): string | undefined {
  return value.length > MAX_DESCRIPTION
    ? `The description can have up to ${MAX_DESCRIPTION} characters.`
    : undefined;
}

const REGIONS: SelectProps.Option[] = [
  { value: "us-east-1", label: "us-east-1", description: "US East (N. Virginia)" },
  { value: "us-east-2", label: "us-east-2", description: "US East (Ohio)" },
  { value: "us-west-1", label: "us-west-1", description: "US West (N. California)" },
  { value: "us-west-2", label: "us-west-2", description: "US West (Oregon)" },
  { value: "af-south-1", label: "af-south-1", description: "Africa (Cape Town)" },
  { value: "ap-east-1", label: "ap-east-1", description: "Asia Pacific (Hong Kong)" },
  { value: "ap-south-1", label: "ap-south-1", description: "Asia Pacific (Mumbai)" },
  { value: "ap-northeast-3", label: "ap-northeast-3", description: "Asia Pacific (Osaka)" },
  { value: "ap-northeast-2", label: "ap-northeast-2", description: "Asia Pacific (Seoul)" },
  { value: "ap-southeast-1", label: "ap-southeast-1", description: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "ap-southeast-2", description: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "ap-northeast-1", description: "Asia Pacific (Tokyo)" },
  { value: "ca-central-1", label: "ca-central-1", description: "Canada (Central)" },
  { value: "eu-central-1", label: "eu-central-1", description: "Europe (Frankfurt)" },
  { value: "eu-west-1", label: "eu-west-1", description: "Europe (Ireland)" },
  { value: "eu-west-2", label: "eu-west-2", description: "Europe (London)" },
  { value: "eu-south-1", label: "eu-south-1", description: "Europe (Milan)" },
  { value: "eu-west-3", label: "eu-west-3", description: "Europe (Paris)" },
  { value: "eu-north-1", label: "eu-north-1", description: "Europe (Stockholm)" },
  { value: "me-south-1", label: "me-south-1", description: "Middle East (Bahrain)" },
  { value: "sa-east-1", label: "sa-east-1", description: "South America (São Paulo)" },
];

/**
 * The backend has no VPC resource, so the region-filtered VPC inventory the console offers is
 * derived deterministically from the region code — the same region always lists the same VPCs.
 */
function vpcsForRegion(region: string): SelectProps.Option[] {
  let hash = 7;
  for (const char of region) hash = (hash * 33 + char.charCodeAt(0)) % 0xffffffff;
  const count = 2 + (hash % 2);
  return Array.from({ length: count }, (_, i) => {
    const id = `vpc-${((hash * (i + 11)) % 0xffffffffffff).toString(16).padStart(12, "0")}`;
    const cidr = i === 0 ? "172.31.0.0/16" : `10.${(hash + i * 17) % 240}.0.0/16`;
    return { value: id, label: `${id} (${cidr})`, description: i === 0 ? "Default VPC" : undefined };
  });
}

type VpcRow = { region: string | null; vpcId: string | null };

const emptyRow = (): VpcRow => ({ region: null, vpcId: null });

/** Region select for one VPC row — changing the region invalidates the chosen VPC. */
function RegionSelect({
  row,
  onChange,
}: {
  row: VpcRow;
  onChange: (next: VpcRow) => void;
}) {
  return (
    <Select
      selectedOption={REGIONS.find((r) => r.value === row.region) ?? null}
      options={REGIONS}
      placeholder="Choose region"
      onChange={({ detail }) => onChange({ region: detail.selectedOption.value ?? null, vpcId: null })}
    />
  );
}

function VpcSelect({ row, onChange }: { row: VpcRow; onChange: (next: VpcRow) => void }) {
  const options = useMemo(() => (row.region ? vpcsForRegion(row.region) : []), [row.region]);
  return (
    <Select
      selectedOption={options.find((o) => o.value === row.vpcId) ?? null}
      options={options}
      placeholder="Choose VPC"
      filteringType="auto"
      disabled={!row.region}
      empty="Choose a region to list its VPCs"
      onChange={({ detail }) => onChange({ ...row, vpcId: detail.selectedOption.value ?? null })}
    />
  );
}

type Errors = {
  name?: string;
  description?: string;
  vpcs?: Record<number, { region?: string; vpcId?: string }>;
  vpcList?: string;
};

export default function CreateHostedZonePage() {
  const router = useRouter();
  const { notify } = useNotify();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ZoneType>("Public");
  const [vpcs, setVpcs] = useState<VpcRow[]>([emptyRow()]);
  const [tags, setTags] = useState<readonly Tag[]>([]);
  const [tagsValid, setTagsValid] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Errors appear on submit, then track the field live so they clear as soon as it is fixed.
  const revalidate = (patch: Errors) => setErrors((prev) => ({ ...prev, ...patch }));

  const setVpcRow = (index: number, next: VpcRow) => {
    setVpcs((prev) => prev.map((row, i) => (i === index ? next : row)));
    if (errors.vpcs?.[index]) {
      revalidate({
        vpcs: {
          ...errors.vpcs,
          [index]: {
            region: next.region ? undefined : "Choose a region.",
            vpcId: next.vpcId ? undefined : "Choose a VPC.",
          },
        },
      });
    }
  };

  const validateAll = (): Errors => {
    const next: Errors = {
      name: validateDomainName(name),
      description: validateDescription(description),
    };
    if (type === "Private") {
      if (vpcs.length === 0) {
        next.vpcList = "Associate at least one VPC with the private hosted zone.";
      } else {
        const rows: Record<number, { region?: string; vpcId?: string }> = {};
        vpcs.forEach((row, i) => {
          rows[i] = {
            region: row.region ? undefined : "Choose a region.",
            vpcId: row.vpcId ? undefined : "Choose a VPC.",
          };
        });
        next.vpcs = rows;
      }
    }
    return next;
  };

  const submit = async () => {
    setFormError("");
    const found = validateAll();
    setErrors(found);
    const hasFieldError =
      !!found.name ||
      !!found.description ||
      !!found.vpcList ||
      Object.values(found.vpcs ?? {}).some((row) => row.region || row.vpcId);
    if (hasFieldError) return;
    if (!tagsValid) {
      setFormError("Resolve the errors in the Tags section before you create the hosted zone.");
      return;
    }

    setSubmitting(true);
    try {
      // VPC associations and tags are presentation-only: the API accepts name/type/comment only.
      const zone = await zoneService.create({
        name: name.trim(),
        type,
        comment: description.trim() || null,
      });
      notify({ type: "success", content: `Hosted zone ${zone.name} created successfully.` });
      router.push(`/hosted-zones/${zone.id}/records`);
    } catch (e) {
      setFormError(apiError(e, "Failed to create hosted zone"));
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: "Create hosted zone" },
      ]}
      contentType="form"
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <Form
          header={
            <Header variant="h1" info={INFO}>
              Create hosted zone
            </Header>
          }
          errorText={formError || undefined}
          errorIconAriaLabel="Error"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                formAction="none"
                disabled={submitting}
                onClick={() => router.push("/hosted-zones")}
              >
                Cancel
              </Button>
              <Button variant="primary" loading={submitting} onClick={submit}>
                Create hosted zone
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container
              header={
                <Header
                  variant="h2"
                  description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
                >
                  Hosted zone configuration
                </Header>
              }
            >
              <Grid gridDefinition={[{ colspan: { default: 12, s: 8 } }]}>
                <SpaceBetween size="l">
                  <FormField
                    label="Domain name"
                    info={INFO}
                    description="This is the name of the domain that you want to route traffic for."
                    constraintText={VALID_CHARACTERS}
                    errorText={errors.name}
                  >
                    <Input
                      value={name}
                      placeholder="example.com"
                      onChange={({ detail }) => {
                        setName(detail.value);
                        if (errors.name) revalidate({ name: validateDomainName(detail.value) });
                      }}
                    />
                  </FormField>

                  <FormField
                    label={
                      <span>
                        Description <i>- optional</i>
                      </span>
                    }
                    info={INFO}
                    description="This value lets you distinguish hosted zones that have the same name."
                    constraintText={`The description can have up to ${MAX_DESCRIPTION} characters. ${description.length}/${MAX_DESCRIPTION}`}
                    errorText={errors.description}
                  >
                    <Textarea
                      value={description}
                      placeholder="The hosted zone is used for..."
                      rows={3}
                      onChange={({ detail }) => {
                        setDescription(detail.value);
                        if (errors.description) {
                          revalidate({ description: validateDescription(detail.value) });
                        }
                      }}
                    />
                  </FormField>

                  <FormField
                    label="Type"
                    info={INFO}
                    description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC."
                  >
                    <Tiles
                      columns={2}
                      value={type}
                      onChange={({ detail }) => {
                        setType(detail.value as ZoneType);
                        setErrors((prev) => ({ ...prev, vpcs: undefined, vpcList: undefined }));
                      }}
                      items={[
                        {
                          value: "Public",
                          label: "Public hosted zone",
                          description: "A public hosted zone determines how traffic is routed on the internet.",
                        },
                        {
                          value: "Private",
                          label: "Private hosted zone",
                          description:
                            "A private hosted zone determines how traffic is routed within an Amazon VPC.",
                        },
                      ]}
                    />
                  </FormField>
                </SpaceBetween>
              </Grid>
            </Container>

            {type === "Private" && (
              <Container
                header={
                  <Header
                    variant="h2"
                    info={INFO}
                    description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs. To associate a VPC with a hosted zone when the VPC was created using a different AWS account, you must use a programmatic method, such as the AWS CLI."
                  >
                    VPCs to associate with the hosted zone
                  </Header>
                }
              >
                <SpaceBetween size="l">
                  <Alert statusIconAriaLabel="Info" dismissible>
                    For each VPC that you associate with a private hosted zone, you must set the Amazon VPC
                    settings{" "}
                    <Link
                      external
                      href="https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html#vpc-dns-updating"
                    >
                      enableDnsHostnames and enableDnsSupport
                    </Link>{" "}
                    to true.
                  </Alert>

                  {/* FormField only for its error slot — AttributeEditor has no list-level error. */}
                  <FormField errorText={errors.vpcList}>
                    <AttributeEditor<VpcRow>
                      items={vpcs}
                      addButtonText="Add VPC"
                      removeButtonText="Remove VPC"
                      removeButtonAriaLabel={(row) => `Remove VPC ${row.vpcId ?? ""}`.trim()}
                      empty={<Box color="text-status-inactive">No VPCs associated with this hosted zone.</Box>}
                      definition={[
                        {
                          label: "Region",
                          info: INFO,
                          errorText: (_row, i) => errors.vpcs?.[i]?.region,
                          control: (row, i) => (
                            <RegionSelect row={row} onChange={(next) => setVpcRow(i, next)} />
                          ),
                        },
                        {
                          label: "VPC ID",
                          info: INFO,
                          errorText: (_row, i) => errors.vpcs?.[i]?.vpcId,
                          control: (row, i) => (
                            <VpcSelect row={row} onChange={(next) => setVpcRow(i, next)} />
                          ),
                        },
                      ]}
                      onAddButtonClick={() => setVpcs((prev) => [...prev, emptyRow()])}
                      onRemoveButtonClick={({ detail }) => {
                        setVpcs((prev) => prev.filter((_, i) => i !== detail.itemIndex));
                        setErrors((prev) => ({ ...prev, vpcs: undefined, vpcList: undefined }));
                      }}
                      i18nStrings={{ errorIconAriaLabel: "Error", itemRemovedAriaLive: "VPC removed" }}
                    />
                  </FormField>
                </SpaceBetween>
              </Container>
            )}

            <Container
              header={
                <Header variant="h2" info={INFO} description="Apply tags to hosted zones to help organize and identify them.">
                  Tags
                </Header>
              }
            >
              <TagEditor
                tags={tags}
                onChange={(next, valid) => {
                  setTags(next);
                  setTagsValid(valid);
                  if (valid) setFormError("");
                }}
              />
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </AppShell>
  );
}
