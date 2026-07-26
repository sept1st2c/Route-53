"use client";

import { Modal } from "./Modal";

const ROWS: [string, string][] = [
  ["Alt + S", "Focus the top search bar"],
  ["/", "Focus the in-page filter box"],
  ["C", "Create (hosted zone or record, depending on the page)"],
  ["Esc", "Close the open modal or menu"],
  ["?", "Show this shortcuts reference"],
];

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose}>
      <table className="w-full text-[14px]">
        <tbody>
          {ROWS.map(([key, desc]) => (
            <tr key={key}>
              <td className="w-32 py-1.5 pr-4 align-top">
                <kbd
                  className="rounded px-2 py-0.5 font-mono text-[12px]"
                  style={{ border: "1px solid var(--rz-borderstrong)", background: "var(--rz-selected)", color: "var(--rz-ink)" }}
                >
                  {key}
                </kbd>
              </td>
              <td className="py-1.5" style={{ color: "var(--rz-secondary)" }}>
                {desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
