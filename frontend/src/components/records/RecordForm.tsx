"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import { RECORD_TYPES, type DNSRecord, type RecordType } from "@/types";

const INK = "var(--rz-ink)";
const MUTED = "var(--rz-muted)";
const ERROR = "#d91515";

const VALUE_HINT: Partial<Record<RecordType, string>> = {
  A: "IPv4 address, e.g. 192.0.2.1. Enter multiple values on separate lines.",
  AAAA: "IPv6 address, e.g. 2001:db8::1. Enter multiple values on separate lines.",
  CNAME: "Canonical name, e.g. example.com.",
  TXT: 'Text value, e.g. "v=spf1 -all".',
  MX: "Priority and mail server, e.g. 10 mail.example.com.",
  NS: "Name server, one per line.",
  PTR: "Domain name the IP maps to.",
  SRV: "Priority weight port target, e.g. 1 10 5269 server.example.com.",
  CAA: '0 issue "letsencrypt.org"',
};

function stripDot(s: string) {
  return s.replace(/\.$/, "");
}

export function RecordForm({
  zoneId,
  zoneName,
  record,
  open,
  onClose,
  onSaved,
}: {
  zoneId: number;
  zoneName: string;
  record: DNSRecord | null; // null = create
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const zone = stripDot(zoneName);
  const isEdit = !!record;

  const [sub, setSub] = useState("");
  const [type, setType] = useState<RecordType>("A");
  const [value, setValue] = useState("");
  const [ttl, setTtl] = useState("300");
  const [routing, setRouting] = useState("Simple");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (record) {
      const full = stripDot(record.name);
      const suffix = full === zone ? "" : full.endsWith("." + zone) ? full.slice(0, -(zone.length + 1)) : full;
      setSub(suffix);
      setType(record.type);
      setValue(record.value);
      setTtl(String(record.ttl ?? 300));
      setRouting(record.routing_policy || "Simple");
    } else {
      setSub("");
      setType("A");
      setValue("");
      setTtl("300");
      setRouting("Simple");
    }
    setError("");
  }, [open, record, zone]);

  const submit = async () => {
    setError("");
    if (!value.trim()) return setError("Enter a value for the record.");
    const fullName = sub.trim() ? `${sub.trim()}.${zone}` : zone;
    const payload = {
      name: fullName,
      type,
      value: value.trim(),
      ttl: Number(ttl) || 300,
      routing_policy: routing,
    };
    setSaving(true);
    try {
      if (isEdit && record) {
        await recordService.update(zoneId, record.id, payload);
        notify({ type: "success", content: `Record ${fullName} updated.` });
      } else {
        await recordService.create(zoneId, payload);
        notify({ type: "success", content: `Record ${fullName} created.` });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(apiError(e, "Failed to save record"));
    } finally {
      setSaving(false);
    }
  };

  const label = "block text-[14px] font-bold";
  const help = "mt-0.5 text-[12px] leading-4";
  const field = "mt-1 w-full rounded-lg bg-[var(--rz-surface)] px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]";

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit record" : "Create record"}
      onClose={onClose}
      footer={
        <>
          <Button variant="link" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create record"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" style={{ color: INK }}>
        {/* Record name */}
        <div>
          <label className={label}>Record name</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="(leave blank for the zone apex)"
              disabled={isEdit}
              className="h-8 flex-1 rounded-lg bg-[var(--rz-surface)] px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)] disabled:bg-[#f4f4f4]"
              style={{ border: "1px solid var(--rz-borderstrong)" }}
            />
            <span className="text-[14px]" style={{ color: MUTED }}>
              .{zone}
            </span>
          </div>
        </div>

        {/* Type + TTL */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className={label}>Record type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RecordType)}
              disabled={isEdit}
              className={field + " h-8 disabled:bg-[#f4f4f4]"}
              style={{ border: "1px solid var(--rz-borderstrong)" }}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className={label}>TTL (seconds)</label>
            <input
              type="number"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              className={field + " h-8"}
              style={{ border: "1px solid var(--rz-borderstrong)" }}
            />
          </div>
        </div>

        {/* Value */}
        <div>
          <label className={label}>Value</label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder={VALUE_HINT[type]}
            className={field + " resize-y py-2"}
            style={{ border: "1px solid var(--rz-borderstrong)", minHeight: 88 }}
          />
          <p className={help} style={{ color: MUTED }}>
            {VALUE_HINT[type] || "Enter multiple values on separate lines."}
          </p>
        </div>

        {/* Routing policy (cosmetic) */}
        <div>
          <label className={label}>Routing policy</label>
          <select
            value={routing}
            onChange={(e) => setRouting(e.target.value)}
            className={field + " h-8"}
            style={{ border: "1px solid var(--rz-borderstrong)" }}
          >
            <option>Simple</option>
          </select>
        </div>

        {error && <p className="text-[12px]" style={{ color: ERROR }}>{error}</p>}
      </div>
    </Modal>
  );
}
