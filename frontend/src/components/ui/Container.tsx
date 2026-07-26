import { ReactNode } from "react";

const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

export function InfoLink() {
  return (
    <button className="text-[12px] font-bold tracking-[0.06px]" style={{ color: "var(--rz-link)" }}>
      Info
    </button>
  );
}

export function Container({
  title,
  description,
  info,
  children,
  variant = "h2",
}: {
  title: string;
  description?: ReactNode;
  info?: boolean;
  children: ReactNode;
  variant?: "h1" | "h2";
}) {
  return (
    <section
      className="rounded-[16px] bg-[var(--rz-surface)]"
      style={{ border: "1px solid var(--rz-border)", fontFamily: FONT, color: "var(--rz-ink)" }}
    >
      <div className="px-5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <h2
            className={variant === "h1" ? "text-[24px] font-bold" : "text-[20px] font-bold"}
            style={{ letterSpacing: "-0.3px" }}
          >
            {title}
          </h2>
          {info && <InfoLink />}
        </div>
        {description && (
          <p className="mt-1 text-[14px]" style={{ color: "var(--rz-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </section>
  );
}
