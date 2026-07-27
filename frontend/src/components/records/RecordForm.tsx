"use client";

import { useEffect, useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { recordService } from "@/lib/services";
import { apiError } from "@/lib/api";
import { useNotify } from "@/context/NotificationContext";
import {
  RECORD_TYPE_OPTIONS,
  ROUTING_POLICY_OPTIONS,
  TTL_CONSTRAINT_TEXT,
  TTL_PRESETS,
  recordTypeOption,
  validateRecordName,
  validateRecordValue,
  validateTtl,
} from "@/lib/dnsValidation";
import type { DNSRecord, RecordType } from "@/types";

const TYPE_OPTIONS = RECORD_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const POLICY_OPTIONS = ROUTING_POLICY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

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
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
    setSubmitError("");
    setSubmitted(false);
  }, [open, record, zone]);

  // Recomputed every render so an error clears the moment the field becomes valid.
  const errors = submitted
    ? {
        name: validateRecordName(sub, zone, type) ?? undefined,
        value: validateRecordValue(type, value) ?? undefined,
        ttl: validateTtl(ttl) ?? undefined,
      }
    : {};

  const submit = async () => {
    setSubmitError("");
    setSubmitted(true);
    if (validateRecordName(sub, zone, type) || validateRecordValue(type, value) || validateTtl(ttl)) return;

    const fullName = sub.trim() ? `${sub.trim()}.${zone}` : zone;
    const payload = {
      name: fullName,
      type,
      value: value.trim(),
      ttl: Number(ttl),
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
      setSubmitError(apiError(e, "Failed to save record"));
    } finally {
      setSaving(false);
    }
  };

  const info = <Link variant="info">Info</Link>;

  return (
    <Modal
      visible={open}
      onDismiss={onClose}
      size="large"
      header={isEdit ? "Edit record" : "Create record"}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" formAction="none" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" formAction="none" loading={saving} onClick={submit}>
              {isEdit ? "Save changes" : "Create record"}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <Form variant="embedded" errorText={submitError || undefined}>
        <SpaceBetween size="l">
          <ColumnLayout columns={2}>
            <FormField
              label="Record name"
              info={info}
              constraintText="Keep blank to use the root domain."
              errorText={errors.name}
            >
              {/* Suffix shares the control row with the input, as the console renders it. */}
              <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
                <Input
                  value={sub}
                  placeholder="subdomain"
                  disabled={isEdit}
                  onChange={({ detail }) => setSub(detail.value)}
                />
                <Box padding={{ top: "xxs" }}>{zone}</Box>
              </Grid>
            </FormField>

            {/* Route 53 keys a record on name + type, so type is immutable once created. */}
            <FormField label="Record type" info={info}>
              <Select
                disabled={isEdit}
                selectedOption={TYPE_OPTIONS.find((o) => o.value === type) ?? { value: type, label: type }}
                options={TYPE_OPTIONS}
                onChange={({ detail }) => setType(detail.selectedOption.value as RecordType)}
              />
            </FormField>
          </ColumnLayout>

          <FormField
            label="Value"
            info={info}
            constraintText="Enter multiple values on separate lines."
            errorText={errors.value}
            stretch
          >
            <Textarea
              rows={4}
              value={value}
              placeholder={recordTypeOption(type)?.placeholder}
              onChange={({ detail }) => setValue(detail.value)}
            />
          </FormField>

          <ColumnLayout columns={2}>
            <FormField
              label="TTL (seconds)"
              info={info}
              constraintText={TTL_CONSTRAINT_TEXT}
              errorText={errors.ttl}
            >
              {/* Quick-set chips share the control row with the input, as the console renders it. */}
              <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={ttl}
                  onChange={({ detail }) => setTtl(detail.value)}
                />
                <SpaceBetween direction="horizontal" size="xs">
                  {TTL_PRESETS.map((p) => (
                    <Button key={p.label} formAction="none" onClick={() => setTtl(String(p.seconds))}>
                      {p.label}
                    </Button>
                  ))}
                </SpaceBetween>
              </Grid>
            </FormField>

            <FormField label="Routing policy" info={info}>
              <Select
                selectedOption={POLICY_OPTIONS.find((o) => o.value === routing) ?? { value: routing, label: routing }}
                options={POLICY_OPTIONS}
                onChange={({ detail }) => setRouting(detail.selectedOption.value ?? "Simple")}
              />
            </FormField>
          </ColumnLayout>
        </SpaceBetween>
      </Form>
    </Modal>
  );
}
