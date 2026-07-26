"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Container, InfoLink } from "@/components/ui/Container";
import { TagEditor } from "@/components/ui/TagEditor";
import { zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { ZoneType } from "@/types";

const INK = "var(--rz-ink)";
const MUTED = "var(--rz-muted)";
const LINK = "var(--rz-link)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

function FieldLabel({ label, optional, info }: { label: string; optional?: boolean; info?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[14px] font-bold" style={{ color: INK }}>
        {label}
        {optional && (
          <i className="font-normal" style={{ color: MUTED }}>
            {" "}
            - <span className="italic">optional</span>
          </i>
        )}
      </label>
      {info && <InfoLink />}
    </div>
  );
}

function TypeTile({
  selected,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-start gap-2 rounded-lg px-3 pb-3 pt-2 text-left"
      style={{
        backgroundColor: selected ? "var(--rz-selected)" : "var(--rz-surface)",
        border: `1px solid ${selected ? LINK : "var(--rz-borderstrong)"}`,
        boxShadow: selected ? "inset 0 0 0 1px var(--rz-link)" : "none",
      }}
    >
      <span className="mt-0.5">
        <svg viewBox="0 0 100 100" width="16" height="16" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke={selected ? LINK : "var(--rz-borderstrong)"} strokeWidth="6.25" />
          {selected && <circle cx="50" cy="50" r="22" fill={LINK} />}
        </svg>
      </span>
      <span>
        <span className="block text-[14px] leading-5" style={{ color: INK }}>
          {title}
        </span>
        <span className="block text-[12px] leading-4" style={{ color: MUTED }}>
          {desc}
        </span>
      </span>
    </button>
  );
}

export default function CreateHostedZonePage() {
  const router = useRouter();
  const { notify } = useNotify();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ZoneType>("Public");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError("");
    if (!name.trim()) {
      setError("Enter a domain name.");
      return;
    }
    setSubmitting(true);
    try {
      const zone = await zoneService.create({ name: name.trim(), type, comment: description.trim() || null });
      notify({ type: "success", content: `Hosted zone ${zone.name} created successfully.` });
      router.push(`/hosted-zones/${zone.id}/records`);
    } catch (e) {
      setError(apiError(e, "Failed to create hosted zone"));
      setSubmitting(false);
    }
  };

  const inputCls =
    "mt-1 block w-full max-w-[66%] rounded-lg bg-[var(--rz-surface)] px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]";

  return (
    <AppShell
      breadcrumbs={[
        { label: "Route 53", href: "/dashboard" },
        { label: "Hosted zones", href: "/hosted-zones" },
        { label: "Create hosted zone" },
      ]}
    >
      <div className="px-7 py-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Title */}
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>
            Create hosted zone
          </h1>
          <InfoLink />
        </div>

        <div className="flex flex-col gap-6 pb-6">
          {/* Configuration */}
          <Container
            title="Hosted zone configuration"
            description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
          >
            <div className="flex flex-col gap-5">
              {/* Domain name */}
              <div>
                <FieldLabel label="Domain name" info />
                <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                  This is the name of the domain that you want to route traffic for.
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="example.com"
                  className={inputCls}
                  style={{ height: 32, border: "1px solid var(--rz-borderstrong)" }}
                />
                <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>
                  {error ? (
                    <span style={{ color: "#d91515" }}>{error}</span>
                  ) : (
                    "Valid characters: a-z, 0-9, ! \" # $ % & ' ( ) * + , - / : ; < = > ? @ [ \\ ] ^ _ ` { | } . ~"
                  )}
                </p>
              </div>

              {/* Description */}
              <div>
                <FieldLabel label="Description" optional info />
                <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                  This value lets you distinguish hosted zones that have the same name.
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 256))}
                  placeholder="The hosted zone is used for..."
                  rows={3}
                  className={inputCls + " resize-y py-1.5"}
                  style={{ border: "1px solid var(--rz-borderstrong)", minHeight: 72 }}
                />
                <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>
                  The description can have up to 256 characters. {description.length}/256
                </p>
              </div>

              {/* Type */}
              <div>
                <FieldLabel label="Type" info />
                <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                  The type indicates whether you want to route traffic on the internet or in an Amazon VPC.
                </p>
                <div className="mt-2 flex max-w-[66%] gap-3">
                  <TypeTile
                    selected={type === "Public"}
                    title="Public hosted zone"
                    desc="A public hosted zone determines how traffic is routed on the internet."
                    onClick={() => setType("Public")}
                  />
                  <TypeTile
                    selected={type === "Private"}
                    title="Private hosted zone"
                    desc="A private hosted zone determines how traffic is routed within an Amazon VPC."
                    onClick={() => setType("Private")}
                  />
                </div>
              </div>
            </div>
          </Container>

          {/* VPCs — only for Private (cosmetic) */}
          {type === "Private" && (
            <Container
              title="VPCs to associate with the hosted zone"
              info
              description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs. To associate a VPC created using a different AWS account, you must use a programmatic method, such as the AWS CLI."
            >
              <div
                className="mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[14px]"
                style={{ backgroundColor: "var(--rz-selected)", border: "1px solid #b3d7f5", color: INK }}
              >
                <span style={{ color: LINK }}>ⓘ</span>
                <span>
                  For each VPC that you associate with a private hosted zone, you must set the Amazon VPC settings{" "}
                  <span style={{ color: LINK, textDecoration: "underline" }}>enableDnsHostnames and enableDnsSupport</span> to true.
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <FieldLabel label="Region" info />
                  <select
                    className="mt-1 h-8 w-full rounded-lg bg-[var(--rz-surface)] px-3 text-[14px]"
                    style={{ border: "1px solid var(--rz-borderstrong)", color: MUTED }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose region
                    </option>
                    <option>us-east-1</option>
                    <option>eu-north-1</option>
                  </select>
                </div>
                <div className="min-w-[240px] flex-1">
                  <FieldLabel label="VPC ID" info />
                  <input
                    placeholder="Choose VPC"
                    className="mt-1 h-8 w-full rounded-lg bg-[var(--rz-surface)] px-3 text-[14px]"
                    style={{ border: "1px solid var(--rz-borderstrong)" }}
                  />
                </div>
                <Button>Remove VPC</Button>
              </div>
              <div className="mt-3">
                <Button>Add VPC</Button>
              </div>
            </Container>
          )}

          {/* Tags (interactive, client-side only) */}
          <Container title="Tags" info description="Apply tags to hosted zones to help organize and identify them.">
            <TagEditor />
          </Container>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="link" onClick={() => router.push("/hosted-zones")} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create hosted zone"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
