/** Client-safe string template helper: fmtClient("{n} sec", { n: 30 }). */
export function fmtClient(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
