"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Textarea from "@cloudscape-design/components/textarea";
import { AppShell } from "@/components/layout/AppShell";
import { TagEditor, type Tag } from "@/components/ui/TagEditor";
import { zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { HostedZone } from "@/types";

const INFO = <Link variant="info">Info</Link>;

const MAX_DESCRIPTION = 256;

// AWS shows the zone name without its trailing dot in titles & breadcrumbs.
const display = (name: string) => name.replace(/\.$/, "");

function validateDescription(value: string): string | undefined {
  return value.length > MAX_DESCRIPTION
    ? `The description can have up to ${MAX_DESCRIPTION} characters.`
    : undefined;
}

export default function EditHostedZonePage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | undefined>();
  const [tags, setTags] = useState<readonly Tag[]>([]);
  const [tagsValid, setTagsValid] = useState(true);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const z = await zoneService.get(zoneId);
      setZone(z);
      setDescription(z.comment ?? "");
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to load hosted zone") });
    }
  }, [zoneId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const recordsHref = `/hosted-zones/${zoneId}/records`;

  const save = async () => {
    setFormError("");
    const invalid = validateDescription(description);
    setDescriptionError(invalid);
    if (invalid) return;
    if (!tagsValid) {
      setFormError("Resolve the errors in the Tags section before you save changes.");
      return;
    }

    setSaving(true);
    try {
      // Send "" (not null) so clearing the description actually persists — the backend
      // only writes `comment` when the field is non-null.
      const updated = await zoneService.update(zoneId, { comment: description.trim() });
      notify({ type: "success", content: `Hosted zone ${updated.name} updated successfully.` });
      router.push(recordsHref);
    } catch (e) {
      notify({ type: "error", content: apiError(e, "Failed to update hosted zone") });
      setSaving(false);
    }
  };

  const name = zone ? display(zone.name) : "";

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: name || "…", href: recordsHref },
        { label: "Edit" },
      ]}
      contentType="form"
    >
      {!zone ? (
        <Box textAlign="center" padding={{ vertical: "xxl" }}>
          <Spinner size="large" />
          <Box variant="p" color="text-status-inactive" padding={{ top: "s" }}>
            Loading hosted zone
          </Box>
        </Box>
      ) : (
        <form onSubmit={(e) => e.preventDefault()}>
          <Form
            header={
              <Header variant="h1" info={INFO}>
                Edit {name}
              </Header>
            }
            errorText={formError || undefined}
            errorIconAriaLabel="Error"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="link"
                  formAction="none"
                  disabled={saving}
                  onClick={() => router.push(recordsHref)}
                >
                  Cancel
                </Button>
                <Button variant="primary" loading={saving} onClick={save}>
                  Save changes
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
                    Edit hosted zone
                  </Header>
                }
              >
                <Grid gridDefinition={[{ colspan: { default: 12, s: 8 } }]}>
                  <SpaceBetween size="l">
                    {/* Everything except the description is fixed once the zone exists. */}
                    <KeyValuePairs
                      columns={1}
                      items={[
                        { label: "Domain name", value: name },
                        { label: "Hosted zone ID", value: zone.zone_id },
                        { label: "Record count", value: String(zone.record_count) },
                        { label: "Type", value: `${zone.type} hosted zone` },
                      ]}
                    />

                    <FormField
                      label={
                        <span>
                          Description <i>- optional</i>
                        </span>
                      }
                      info={INFO}
                      description="This value lets you distinguish hosted zones that have the same name."
                      constraintText={`The description can have up to ${MAX_DESCRIPTION} characters. ${description.length}/${MAX_DESCRIPTION}`}
                      errorText={descriptionError}
                    >
                      <Textarea
                        value={description}
                        placeholder="The hosted zone is used for..."
                        rows={3}
                        onChange={({ detail }) => {
                          setDescription(detail.value);
                          if (descriptionError) setDescriptionError(validateDescription(detail.value));
                        }}
                      />
                    </FormField>
                  </SpaceBetween>
                </Grid>
              </Container>

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
      )}
    </AppShell>
  );
}
