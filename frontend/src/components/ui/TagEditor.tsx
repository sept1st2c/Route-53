"use client";

import { useState } from "react";
import { Button } from "./Button";

const INK = "var(--rz-ink)";
const MUTED = "var(--rz-muted)";
const ERROR = "#db0000";
const MAX_TAGS = 50;

type Tag = { key: string; value: string };

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke={MUTED} strokeWidth="1.4" aria-hidden>
      <path d="m11 11 4 4M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke={ERROR} strokeWidth="1.4" aria-hidden className="mt-0.5">
      <circle cx="8" cy="8" r="7" />
      <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" strokeLinecap="round" />
    </svg>
  );
}

export function TagEditor({ onChange }: { onChange?: (tags: Tag[]) => void }) {
  const [tags, setTags] = useState<Tag[]>([]);

  const update = (next: Tag[]) => {
    setTags(next);
    onChange?.(next);
  };
  const add = () => update([...tags, { key: "", value: "" }]);
  const remove = (i: number) => update(tags.filter((_, idx) => idx !== i));
  const setField = (i: number, field: keyof Tag, v: string) =>
    update(tags.map((t, idx) => (idx === i ? { ...t, [field]: v } : t)));

  const inputBase = "h-8 w-full rounded-lg bg-[var(--rz-surface)] pl-9 pr-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--rz-link)]";

  return (
    <div>
      {tags.length === 0 ? (
        <p className="text-[14px]" style={{ color: INK }}>
          No tags associated with the resource.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {tags.map((t, i) => {
            const keyEmpty = t.key.trim() === "";
            return (
              <div key={i} className="flex flex-wrap items-start gap-3">
                {/* Key */}
                <div className="min-w-[240px] flex-1" style={{ maxWidth: 580 }}>
                  {i === 0 ? (
                    <label className="mb-1 block text-[14px] font-bold" style={{ color: INK }}>
                      Key
                    </label>
                  ) : (
                    <span className="sr-only">Key</span>
                  )}
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <SearchIcon />
                    </span>
                    <input
                      value={t.key}
                      onChange={(e) => setField(i, "key", e.target.value)}
                      placeholder="Enter key"
                      className={inputBase}
                      style={{ border: `1px solid ${keyEmpty ? ERROR : "var(--rz-borderstrong)"}`, color: keyEmpty ? ERROR : INK }}
                    />
                  </div>
                  {keyEmpty && (
                    <div className="mt-1 flex items-start gap-1 text-[12px]" style={{ color: ERROR }}>
                      <ErrorIcon />
                      <span>Key is empty.</span>
                    </div>
                  )}
                </div>

                {/* Value */}
                <div className="min-w-[240px] flex-1" style={{ maxWidth: 580 }}>
                  {i === 0 ? (
                    <label className="mb-1 block text-[14px] font-bold" style={{ color: INK }}>
                      Value <i className="font-normal italic" style={{ color: MUTED }}>- optional</i>
                    </label>
                  ) : (
                    <span className="sr-only">Value - optional</span>
                  )}
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <SearchIcon />
                    </span>
                    <input
                      value={t.value}
                      onChange={(e) => setField(i, "value", e.target.value)}
                      placeholder="Enter value"
                      className={inputBase}
                      style={{ border: "1px solid var(--rz-borderstrong)", color: INK }}
                    />
                  </div>
                </div>

                {/* Remove */}
                <div className={i === 0 ? "pt-7" : ""}>
                  <Button onClick={() => remove(i)} aria-label="Remove tag">
                    Remove tag
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <Button onClick={add} disabled={tags.length >= MAX_TAGS}>
          Add tag
        </Button>
      </div>
      <p className="mt-2 text-[12px]" style={{ color: MUTED }}>
        You can add up to {MAX_TAGS - tags.length} more tags.
      </p>
    </div>
  );
}
