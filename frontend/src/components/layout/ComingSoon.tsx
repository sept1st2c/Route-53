"use client";

import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Shared placeholder screen for the mocked Route 53 sections (Dashboard, Health checks,
 * Profiles, Resolver, Traffic flow, …). Keeps the full console chrome — top nav, side nav
 * and breadcrumbs — so only the main panel reads "Coming soon".
 */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <AppShell
      breadcrumbs={[{ label: "Route 53", href: "/dashboard" }, { label: title }]}
      contentType="default"
    >
      <SpaceBetween size="l">
        <Header
          variant="h1"
          description={description ?? `Manage your ${title.toLowerCase()} from this console.`}
        >
          {title}
        </Header>

        <Container>
          <Box textAlign="center" padding={{ vertical: "xxxl" }}>
            <SpaceBetween size="m">
              <StatusIndicator type="pending">Coming soon</StatusIndicator>
              <Box variant="p" color="text-body-secondary">
                This section of the Route 53 console isn&apos;t available yet. Hosted zones and DNS
                records are fully functional — explore those in the meantime.
              </Box>
            </SpaceBetween>
          </Box>
        </Container>
      </SpaceBetween>
    </AppShell>
  );
}
