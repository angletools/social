import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  help,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  help?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            {title}
            {help && <HelpTip text={help} />}
          </h2>
          {actions}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <CircleHelp className="h-3.5 w-3.5 text-slate-400" aria-label={text} />
      <span className="pointer-events-none absolute start-1/2 top-5 z-30 w-64 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block hidden rtl:translate-x-1/2">
        {text}
      </span>
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
  icon,
  vsLabel,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  invert?: boolean;
  help?: string;
  icon?: React.ReactNode;
  vsLabel?: string;
}) {
  const good = delta === undefined || delta === 0 ? null : invert ? delta < 0 : delta > 0;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          {label}
          {help && <HelpTip text={help} />}
        </span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight ltr-nums">{value}</div>
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ltr-nums",
              good === null && "bg-slate-100 text-slate-600",
              good === true && "bg-green-50 text-green-700",
              good === false && "bg-red-50 text-red-700",
            )}
          >
            {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaSuffix}
          </span>
          {vsLabel && <span className="text-muted">{vsLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>}
      {cta && (
        <Link href={cta.href} className="btn-primary mt-6">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700", className)}>{children}</span>;
}
