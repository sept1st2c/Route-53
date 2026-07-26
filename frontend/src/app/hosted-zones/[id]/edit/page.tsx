"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Container, InfoLink } from "@/components/ui/Container";
import { TagEditor } from "@/components/ui/TagEditor";
import { zoneService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import type { HostedZone } from "@/types";

const INK = "var(--rz-ink)";
const MUTED = "var(--rz-muted)";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

// AWS shows the zone name without its trailing dot in titles & breadcrumbs.
const display = (name: string) => name.replace(/\.$/, "");

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[14px] font-bold" style={{ color: INK }}>
        {label}
      </div>
      <div className="mt-0.5 text-[14px]" style={{ color: INK }}>
        {value}
      </div>
    </div>
  );
}

export default function EditHostedZonePage() {
  const params = useParams();
  const router = useRouter();
  const zoneId = Number(params.id);
  const { notify } = useNotify();

  const [zone, setZone] = useState<HostedZone | null>(null);
  const [description, setDescription] = useState("");
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
    >
      <div className="px-7 py-3" style={{ fontFamily: FONT, color: INK }}>
        {/* Title */}
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-[24px] font-bold" style={{ letterSpacing: "-0.48px" }}>
            Edit {name}
          </h1>
          <InfoLink />
        </div>

        {!zone ? (
          <div className="py-12 text-[14px]" style={{ color: MUTED }}>
            Loading…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-6 pb-6">
              {/* Edit hosted zone */}
              <Container
                title="Edit hosted zone"
                description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
              >
                <div className="flex flex-col gap-5">
                  <ReadOnlyField label="Domain name" value={name} />
                  <ReadOnlyField label="Hosted zone ID" value={zone.zone_id} />
                  <ReadOnlyField label="Record count" value={String(zone.record_count)} />
                  <ReadOnlyField label="Type" value={`${zone.type} hosted zone`} />

                  {/* Description (editable) */}
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="text-[14px] font-bold" style={{ color: INK }}>
                        Description
                        <i className="font-normal" style={{ color: MUTED }}>
                          {" "}
                          - <span className="italic">optional</span>
                        </i>
                      </label>
                      <InfoLink />
                    </div>
                    <p className="text-[12px] leading-4" style={{ color: MUTED }}>
                      This value lets you distinguish hosted zones that have the same name.
                    </p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 256))}
                      placeholder="The hosted zone is used for..."
                      rows={3}
                      className="mt-1 block w-full max-w-[66%] resize-y rounded-lg bg-[var(--rz-surface)] px-3 py-1.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]"
                      style={{ border: "1px solid var(--rz-borderstrong)", minHeight: 72 }}
                    />
                    <p className="mt-1 text-[12px] leading-4" style={{ color: MUTED }}>
                      The description can have up to 256 characters. {description.length}/256
                    </p>
                  </div>
                </div>
              </Container>

              {/* Tags (interactive, client-side only) */}
              <Container title="Tags" info description="Apply tags to hosted zones to help organize and identify them.">
                <TagEditor />
              </Container>
            </div>

            {/* Footer actions */}
            <div className="flex justify-end gap-3 pb-6">
              <Button variant="link" onClick={() => router.push(recordsHref)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
