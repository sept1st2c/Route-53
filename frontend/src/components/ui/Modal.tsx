"use client";

import { ReactNode } from "react";
import CloudscapeModal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";

/**
 * Thin adapter over Cloudscape's Modal.
 *
 * Cloudscape names the props `visible` / `onDismiss` / `header`; this keeps the
 * repo's existing `open` / `onClose` / `title` shape so the call sites (delete
 * confirmations, the export picker, the shortcuts reference) stay unchanged.
 * Cloudscape supplies the focus trap, Escape handling, scroll locking and footer
 * alignment that the previous hand-rolled dialog only approximated.
 */
export function Modal({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  // Cloudscape's Modal mounts a Portal even while hidden, and the placeholder it injects
  // is absent from the server HTML — which produced a hydration mismatch on every page,
  // since the shortcuts modal is always mounted by ShortcutsProvider. Rendering nothing
  // until the dialog is actually opened avoids that and keeps closed dialogs out of the DOM.
  if (!open) return null;

  return (
    <CloudscapeModal
      visible={open}
      onDismiss={onClose}
      header={title}
      closeAriaLabel="Close"
      footer={footer ? <Box float="right">{footer}</Box> : undefined}
    >
      {children}
    </CloudscapeModal>
  );
}
