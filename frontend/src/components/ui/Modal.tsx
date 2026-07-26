"use client";

import { ReactNode } from "react";

const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center" style={{ fontFamily: FONT }}>
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15,20,26,0.5)" }} onClick={onClose} />
      <div
        className="relative z-10 mt-[12vh] w-full max-w-[560px] rounded-[16px] bg-[var(--rz-surface)]"
        style={{ boxShadow: "0 4px 20px 1px rgba(0,7,22,0.2)" }}
        role="dialog"
        aria-modal
      >
        <div className="flex items-start justify-between px-6 pt-5">
          <h2 className="text-[18px] font-bold" style={{ color: "var(--rz-ink)", letterSpacing: "-0.18px" }}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--rz-secondary)" }} className="p-1">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 text-[14px]" style={{ color: "var(--rz-ink)" }}>
          {children}
        </div>
        {footer && <div className="flex justify-end gap-3 px-6 pb-5 pt-1">{footer}</div>}
      </div>
    </div>
  );
}
