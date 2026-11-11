/** Static SVG donut (no animation, crisp, server-rendered). */
export function Donut({
  data,
  size = 168,
  thickness = 16,
  center,
  caption,
}: {
  data: { value: number; color: string; name: string }[];
  size?: number;
  thickness?: number;
  center: string;
  caption: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = data.filter((d) => d.value > 0).length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={thickness} />
        {data.map((d) => {
          const len = (d.value / total) * c;
          const seg = Math.max(0, len - gap);
          const el = (
            <circle
              key={d.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${seg} ${c - seg}`}
              strokeDashoffset={-offset}
            >
              <title>{`${d.name}: ${d.value}`}</title>
            </circle>
          );
          offset += len;
          return d.value > 0 ? el : null;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold leading-none tracking-tight ltr-nums">{center}</span>
        <span className="mt-1.5 text-xs text-muted">{caption}</span>
      </div>
    </div>
  );
}
