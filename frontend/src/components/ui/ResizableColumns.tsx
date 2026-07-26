"use client";

import { useCallback, useRef, useState } from "react";

/**
 * AWS Cloudscape–style resizable table columns. Manages a width (px) per column
 * and exposes a mousedown handler that drives a live drag on the column's right edge.
 *
 * Usage:
 *   const { widths, startResize } = useResizableColumns([200, 80, ...]);
 *   <table style={{ tableLayout: "fixed", width: total }}>
 *     <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
 *     ...<th style={{ position: "relative" }}>Name<ResizeHandle onMouseDown={(e) => startResize(i, e)} /></th>
 */
export function useResizableColumns(initial: number[], min = 56) {
  const [widths, setWidths] = useState<number[]>(initial);
  const drag = useRef<{ index: number; startX: number; startW: number } | null>(null);

  const onMove = useRef((e: MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(min, d.startW + (e.clientX - d.startX));
    setWidths((w) => (w[d.index] === next ? w : w.map((x, i) => (i === d.index ? next : x))));
  });

  const onUp = useRef(() => {
    drag.current = null;
    document.removeEventListener("mousemove", onMove.current);
    document.removeEventListener("mouseup", onUp.current);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  const startResize = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { index, startX: e.clientX, startW: widths[index] };
    document.addEventListener("mousemove", onMove.current);
    document.addEventListener("mouseup", onUp.current);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [widths]);

  const total = widths.reduce((a, b) => a + b, 0);
  return { widths, total, startResize };
}

/** The grabbable divider on a header cell's right edge. Parent <th> must be position:relative. */
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      className="group absolute top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-end"
      style={{ right: -6 }}
    >
      <span
        className="h-[18px] w-px transition-colors group-hover:w-[2px]"
        style={{ background: "var(--rz-borderstrong)" }}
      />
    </span>
  );
}
