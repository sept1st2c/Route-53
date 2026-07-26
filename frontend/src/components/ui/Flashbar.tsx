"use client";

import { useNotify, FlashType } from "@/context/NotificationContext";

const STYLES: Record<FlashType, { bg: string; fg: string }> = {
  success: { bg: "#067f5b", fg: "#ffffff" },
  error: { bg: "#d91515", fg: "#ffffff" },
  info: { bg: "#006ce0", fg: "#ffffff" },
  warning: { bg: "#8d6605", fg: "#ffffff" },
};

function Icon({ type }: { type: FlashType }) {
  if (type === "success")
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="8" cy="8" r="7" />
        <path d="m5 8 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === "error" || type === "warning")
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="8" cy="8" r="7" />
        <path d="M8 4v5M8 11.5v.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="8" cy="8" r="7" />
      <path d="M8 7v5M8 4.5v.5" strokeLinecap="round" />
    </svg>
  );
}

export function Flashbar() {
  const { flashes, dismiss } = useNotify();
  if (flashes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-7 pt-3">
      {flashes.map((f) => {
        const s = STYLES[f.type];
        return (
          <div
            key={f.id}
            className="flex items-start gap-2 rounded-[12px] px-4 py-3 text-[14px]"
            style={{ backgroundColor: s.bg, color: s.fg }}
            role="status"
          >
            <span className="mt-0.5 shrink-0">
              <Icon type={f.type} />
            </span>
            <div className="flex-1">
              {f.header && <span className="font-bold">{f.header}: </span>}
              {f.content}
            </div>
            <button onClick={() => dismiss(f.id)} aria-label="Dismiss" className="mt-0.5 shrink-0 opacity-90 hover:opacity-100">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
