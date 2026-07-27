"use client";

import CloudscapeFlashbar from "@cloudscape-design/components/flashbar";
import { useNotify } from "@/context/NotificationContext";

/**
 * Console notifications, rendered into AppLayout's `notifications` slot.
 * Cloudscape's Flashbar is the component the real console uses, so it brings the
 * correct icons, colours, dismiss affordance and stacking for free.
 */
export function Flashbar() {
  const { flashes, dismiss } = useNotify();
  if (flashes.length === 0) return null;

  return (
    <CloudscapeFlashbar
      items={flashes.map((f) => ({
        id: f.id,
        type: f.type,
        header: f.header,
        content: f.content,
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => dismiss(f.id),
      }))}
    />
  );
}
