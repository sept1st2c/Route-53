"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { useNotify } from "@/context/NotificationContext";
import type { HostedZone } from "@/types";

/**
 * Query logging publishes to CloudWatch Logs, which this clone doesn't implement — so the
 * form is faithful to the console but every submit path says so instead of faking success.
 */
const UNAVAILABLE =
  "Query logging publishes DNS queries to Amazon CloudWatch Logs. CloudWatch Logs isn't part of this Route 53 clone, so no log groups can be listed and no query logging configuration can be created.";

type ResourcePolicy = {
  name: string;
  updated: string;
  matches: string;
  grants: string;
};

const POLICY_COLUMNS: TableProps.ColumnDefinition<ResourcePolicy>[] = [
  { id: "name", header: "Policy name", cell: (p) => p.name },
  { id: "updated", header: "Last updated time", cell: (p) => p.updated },
  { id: "matches", header: "Matches log group", cell: (p) => p.matches },
  { id: "grants", header: "Grants permission", cell: (p) => p.grants },
];

export default function QueryLoggingPage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [logGroup, setLogGroup] = useState<SelectProps.Option | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    zoneService
      .get(zoneId)
      .then(setZone)
      .catch((e) => notify({ type: "error", content: apiError(e, "Failed to load hosted zone") }));
  }, [zoneId, notify]);

  const zoneName = zone ? zone.name.replace(/\.$/, "") : "…";
  const recordsHref = `/hosted-zones/${zoneId}/records`;

  const onCreate = () => {
    setError(UNAVAILABLE);
    notify({
      type: "error",
      header: "Couldn't create the query logging configuration",
      content: UNAVAILABLE,
    });
  };

  return (
    <AppShell
      contentType="form"
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: zoneName },
      ]}
    >
      <Form
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            description="You can configure Amazon Route 53 to log information about the queries that Route 53 receives, such as the domain or subdomain that was requested, the date and time of the query, and the DNS record type (such as A or AAAA)."
          >
            Configure query logging
          </Header>
        }
        errorText={error}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push(recordsHref)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onCreate}>
              Create
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container
            header={
              <Header
                variant="h2"
                info={<Link variant="info">Info</Link>}
                description="Specify the CloudWatch Logs log group where you want Route 53 to save DNS queries for records in this hosted zone."
              >
                Log group
              </Header>
            }
          >
            <FormField
              label="Log group"
              description="You can choose the name of an existing log group or choose to create a new log group."
              constraintText="The log group can have up to 512 characters. Valid characters: a-z, A-Z, 0-9, and . _ / # - (hyphen)"
              stretch
            >
              <Grid gridDefinition={[{ colspan: 8 }, { colspan: 4 }]}>
                <Select
                  selectedOption={logGroup}
                  options={[]}
                  onChange={({ detail }) => setLogGroup(detail.selectedOption)}
                  placeholder="/aws/route53/example.com"
                  filteringType="auto"
                  empty="No log groups found."
                  selectedAriaLabel="Selected"
                  ariaLabel="Log group"
                />
                <Button
                  iconName="refresh"
                  variant="icon"
                  ariaLabel="Refresh log groups"
                  onClick={() => setError(UNAVAILABLE)}
                />
              </Grid>
            </FormField>
          </Container>

          <Alert
            type="warning"
            statusIconAriaLabel="Warning"
            header="Missing permission"
            action={<Button onClick={() => setError(UNAVAILABLE)}>Grant permissions</Button>}
          >
            <SpaceBetween size="s">
              <span>
                Route 53 needs permission from a resource policy to publish logs to a CloudWatch Logs log
                group. No existing resource policies grant the required permissions.
              </span>
              <ExpandableSection headerText="Details" variant="footer">
                <SpaceBetween size="xs">
                  <span>
                    Route 53 needs a CloudWatch Logs resource policy that lets the{" "}
                    <Box variant="code">route53.amazonaws.com</Box> service principal call{" "}
                    <Box variant="code">logs:CreateLogStream</Box> and{" "}
                    <Box variant="code">logs:PutLogEvents</Box> on the log group.
                  </span>
                  <span>
                    Both the log group and the resource policy must be in the US East (N. Virginia)
                    (us-east-1) Region, in the same AWS account as this hosted zone. Using a consistent{" "}
                    <Box variant="code">/aws/route53/*</Box> prefix lets one resource policy cover every
                    log group you create for query logging.
                  </span>
                </SpaceBetween>
              </ExpandableSection>
            </SpaceBetween>
          </Alert>

          <ExpandableSection
            headerText={
              <>
                Permissions <i>- optional</i>
              </>
            }
          >
            <Table<ResourcePolicy>
              variant="container"
              items={[]}
              columnDefinitions={POLICY_COLUMNS}
              trackBy="name"
              header={
                <Header
                  variant="h2"
                  counter="(0)"
                  info={<Link variant="info">Info</Link>}
                  description="If you delete one of the following resource policies and choose Grant permission, Route 53 creates a resource policy that grants permission to publish logs to any log group. You can also edit an existing resource policy."
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button disabled>Edit</Button>
                      <Button disabled>Delete</Button>
                    </SpaceBetween>
                  }
                >
                  Edit or delete a CloudWatch Logs resource policy
                </Header>
              }
              empty={
                <Box textAlign="center" color="inherit" padding={{ vertical: "l" }}>
                  <SpaceBetween size="s">
                    <Box variant="strong" color="inherit">
                      No resource policies found.
                    </Box>
                    <Button onClick={() => setError(UNAVAILABLE)}>Grant permission</Button>
                  </SpaceBetween>
                </Box>
              }
            />
          </ExpandableSection>
        </SpaceBetween>
      </Form>
    </AppShell>
  );
}
