"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ComingSoon } from "@/components/layout/ComingSoon";

const SECTIONS: Record<string, { title: string; description: string }> = {
  "global-resolvers": {
    title: "Global resolvers",
    description: "Create global resolver endpoints that route DNS queries across regions and VPCs.",
  },
  "shared-dns-views": {
    title: "Shared DNS views",
    description: "Share a consistent view of your private DNS names across accounts and VPCs.",
  },
  "registered-domains": {
    title: "Registered domains",
    description: "Domains registered with Route 53, and their renewal and transfer settings.",
  },
  requests: {
    title: "Requests",
    description: "Track the status of domain registration, transfer, and update requests.",
  },
  "cidr-collections": {
    title: "CIDR collections",
    description: "Group CIDR blocks to route traffic based on the IP address of the client.",
  },
  vpcs: {
    title: "VPCs",
    description: "View the VPCs associated with your private hosted zones.",
  },
  "inbound-endpoints": {
    title: "Inbound endpoints",
    description: "Allow DNS queries from your network to resolve names in a VPC.",
  },
  "outbound-endpoints": {
    title: "Outbound endpoints",
    description: "Forward DNS queries from a VPC to resolvers on your on-premises network.",
  },
  rules: {
    title: "Rules",
    description: "Specify which VPC forwards DNS queries to your outbound endpoint, and where.",
  },
  "query-logging": {
    title: "Query logging",
    description: "Log DNS queries that originate in your VPCs.",
  },
  outposts: {
    title: "Outposts",
    description: "Configure Route 53 Resolver on AWS Outposts.",
  },
};

function ResolverContent() {
  const params = useSearchParams();
  const section = SECTIONS[params.get("section") ?? ""] ?? {
    title: "Resolver",
    description: "Configure VPC DNS resolvers, endpoints and forwarding rules.",
  };
  return <ComingSoon title={section.title} description={section.description} />;
}

export default function ResolverPage() {
  return (
    <Suspense fallback={null}>
      <ResolverContent />
    </Suspense>
  );
}
