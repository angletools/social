import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  help,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: string;
  help?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold">
              {title}
              {help && <HelpTip text={help} />}
            </h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", title && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-label={text}>
      <CircleHelp className="h-3.5 w-3.5 text-faint transition group-hover:text-muted" />
      <span className="pointer-events-none absolute start-1/2 top-6 z-30 hidden w-64 -translate-x-1/2 rounded-xl bg-ink px-3 py-2.5 text-xs font-normal leading-relaxed text-white shadow-[var(--shadow-pop)] group-hover:block group-focus:block rtl:translate-x-1/2">
        {text}
      </span>
    </span>
  );
}

export function Delta({ value, suffix = "%", invert }: { value: number; suffix?: string; invert?: boolean }) {
  const good = value === 0 ? null : invert ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium ltr-nums",
        good === null && "text-faint",
        good === true && "text-pos",
        good === false && "text-neg",
      )}
    >
      {value > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : value < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
      {value > 0 ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  deltaSuffix = "%",
  invert,
  help,
  vsLabel,
  trend,
  trendColor,
  href,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  invert?: boolean;
  help?: string;
  vsLabel?: string;
  trend?: number[];
  trendColor?: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[12.5px] leading-snug text-muted sm:text-[13px]">
        {label}
        {help && <HelpTip text={help} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="whitespace-nowrap text-[21px] font-semibold leading-none tracking-tight ltr-nums sm:text-[28px]">{value}</div>
        {trend && trend.length > 1 && (
          <div className="hidden w-24 shrink-0 pb-0.5 sm:block">
            <Sparkline values={trend} color={trendColor} height={30} />
          </div>
        )}
      </div>
      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          <Delta value={delta} suffix={deltaSuffix} invert={invert} />
          {vsLabel && <span className="text-xs text-faint">{vsLabel}</span>}
        </div>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition hover:border-line-strong sm:p-5">
      {body}
    </Link>
  ) : (
    <div className="card p-4 sm:p-5">{body}</div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  cta?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-canvas text-muted">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">{body}</p>}
      {cta && (
        <Link href={cta.href} className="btn-primary mt-6">
          {cta.label}
        </Link>
      )}
      {children}
    </div>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("chip", className)}>{children}</span>;
}

/** Status pill with a coloured dot; tone carries meaning, not decoration. */
export function StatusPill({ tone, children, pulse }: { tone: "neutral" | "good" | "warn" | "bad" | "info" | "brand"; children: React.ReactNode; pulse?: boolean }) {
  const dot = { neutral: "bg-faint", good: "bg-pos", warn: "bg-warn", bad: "bg-neg", info: "bg-[#3b74c4]", brand: "bg-brand-600" }[tone];
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-ink">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot, pulse && "animate-pulse")} />
      {children}
    </span>
  );
}

/** Thin horizontal meter used in ranked lists. */
export function Meter({ value, max, color = "var(--color-brand-600)" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`, background: color }} />
    </div>
  );
}
