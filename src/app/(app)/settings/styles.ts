/** Shared class names for the settings sections, so every card matches the board. */
export const S = {
  panel: "card flex flex-col gap-5 p-5 sm:p-6",
  title: "text-[16px] leading-6 font-semibold",
  sub: "text-[13.5px] leading-relaxed text-muted",
  field: "flex min-w-0 flex-col gap-2",
  label: "text-[13.5px] font-medium",
  input: "input h-[42px] px-3.5 md:text-[14.5px]",
  main: "btn-primary h-10 px-[18px] text-[14px] font-semibold",
  line: "btn-secondary h-10 px-4 text-[14px]",
  lineSm: "btn-secondary h-9 rounded-[10px] px-3.5 text-[13.5px]",
  mainSm: "btn-primary h-9 rounded-[10px] px-3.5 text-[13.5px] font-semibold",
  ghost: "btn-ghost h-10 px-3.5 text-[14px]",
  ghostSm: "btn-ghost h-9 rounded-[10px] px-3 text-[13.5px]",
};

export const SECTIONS = ["general", "team", "voice", "integrations", "weekly", "compliance", "plan", "system"] as const;
export type Section = (typeof SECTIONS)[number];
