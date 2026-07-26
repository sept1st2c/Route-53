"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "normal" | "link";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  iconOnly?: boolean;
  children?: ReactNode;
}

// AWS Cloudscape pill buttons (new console look).
export function Button({ variant = "normal", iconOnly, className = "", disabled, children, ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full text-[14px] font-bold tracking-[0.07px] transition-colors disabled:cursor-not-allowed";
  const pad = iconOnly ? "h-8 w-8" : "h-8 px-5";

  let cls = "";
  if (variant === "primary") {
    cls = disabled
      ? "bg-[var(--rz-divider)] text-[var(--rz-muted)] border border-[var(--rz-divider)]"
      : "bg-[#ff9900] text-[var(--rz-ink)] border border-[#ff9900] hover:bg-[#ec7211]";
  } else if (variant === "link") {
    cls = "text-[var(--rz-link)] hover:underline";
  } else {
    cls = disabled
      ? "bg-[var(--rz-surface)] text-[var(--rz-borderstrong)] border-[1.5px] border-[var(--rz-borderstrong)]"
      : "bg-[var(--rz-surface)] text-[var(--rz-link)] border-[1.5px] border-[var(--rz-link)] hover:bg-[var(--rz-selected)]";
  }

  return (
    <button
      disabled={disabled}
      className={`${base} ${variant === "link" ? "" : pad} ${cls} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
