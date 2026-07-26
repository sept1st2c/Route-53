"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ComingSoon } from "@/components/layout/ComingSoon";

const SECTIONS: Record<string, { title: string; description: string }> = {
  "traffic-policies": {
    title: "Traffic policies",
    description: "Create reusable traffic policy documents to route traffic based on multiple criteria.",
  },
  "policy-records": {
    title: "Policy records",
    description: "DNS records that were created from a traffic policy.",
  },
};

function TrafficPoliciesContent() {
  const params = useSearchParams();
  const section = SECTIONS[params.get("section") ?? ""] ?? {
    title: "Traffic policies",
    description: "Create and manage traffic policy documents and policy records.",
  };
  return <ComingSoon title={section.title} description={section.description} />;
}

export default function TrafficPoliciesPage() {
  return (
    <Suspense fallback={null}>
      <TrafficPoliciesContent />
    </Suspense>
  );
}
