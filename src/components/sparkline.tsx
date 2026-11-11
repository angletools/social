"use client";

import { useMemo } from "react";
import { AreaSparkline, LineSparkline } from "@/components/charts/sparkline";

/** Small inline trend for KPI cards (Bklit AreaSparkline). Fills its container's width. */
export function Sparkline({ values, color = "var(--chart-1)", height = 32, width, label }: { values: number[]; color?: string; height?: number; width?: number; label?: string }) {
  const data = useMemo(() => values.map((v, i) => ({ i, v })), [values]);
  if (data.length < 2) return null;
  return (
    <div dir="ltr" style={width ? { width } : undefined} className="max-w-full">
      {values.some((v) => v < 0) ? (
        <LineSparkline data={data} dataKey="v" height={height} color={color} crosshair={false} animationDuration={600} aria-label={label} />
      ) : (
        <AreaSparkline data={data} dataKey="v" height={height} color={color} fill="gradient" crosshair={false} animationDuration={600} aria-label={label} />
      )}
    </div>
  );
}
