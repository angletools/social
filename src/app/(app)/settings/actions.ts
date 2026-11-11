"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { parseRules, senderFor, serializeRules, webhookKind } from "@/lib/workspace";

type Result = { ok: true } | { ok: false; error: string };
type Channel = "slack" | "teams" | "email";

const FIELD = { slack: "slackWebhookUrl", teams: "teamsWebhookUrl", email: "emailFrom" } as const;

/** Sets (or clears, with an empty value) a workspace delivery channel. */
export async function saveChannel(kind: Channel, value: string): Promise<Result> {
  const user = await requireRole("ADMIN");
  const v = value.trim().slice(0, 500);
  if (v) {
    if (kind === "email") {
      if (!z.email().safeParse(v).success) return { ok: false, error: "email" };
    } else {
      const { isAllowedWebhook } = await import("@/lib/webhooks");
      if (!isAllowedWebhook(v) || webhookKind(v) !== kind) return { ok: false, error: "webhook" };
    }
  }
  await db.organization.update({ where: { id: user.organizationId }, data: { [FIELD[kind]]: v || null } });
  await audit(user, "org.channels", kind, { set: Boolean(v) });
  revalidatePath("/settings");
  return { ok: true };
}

/** Sends a test message through a saved channel; email goes to the person testing. */
export async function testChannel(kind: Channel, message: { subject: string; body: string }): Promise<Result> {
  const user = await requireRole("ADMIN");
  const org = user.organization;
  try {
    if (kind === "email") {
      const { sendEmail } = await import("@/lib/email");
      const sent = await sendEmail([user.email], message.subject.slice(0, 200), message.body.slice(0, 2000), senderFor(org));
      return sent ? { ok: true } : { ok: false, error: "not_configured" };
    }
    const url = kind === "slack" ? org.slackWebhookUrl : org.teamsWebhookUrl;
    if (!url) return { ok: false, error: "not_configured" };
    const { postWebhook } = await import("@/lib/webhooks");
    await postWebhook(url, message.body.slice(0, 2000));
    return { ok: true };
  } catch (e) {
    console.error("channel test failed", (e as Error).message);
    return { ok: false, error: "failed" };
  }
}

export async function addComplianceRule(text: string): Promise<Result> {
  const user = await requireRole("ADMIN");
  const rule = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!rule) return { ok: false, error: "invalid" };
  const rules = parseRules(user.organization.complianceRules);
  if (rules.length >= 40) return { ok: false, error: "limit" };
  await db.organization.update({ where: { id: user.organizationId }, data: { complianceRules: serializeRules([...rules, rule]).slice(0, 6000) } });
  await audit(user, "compliance.add", undefined, { rule });
  revalidatePath("/settings");
  return { ok: true };
}

/** Removes a rule by position, but only if it still says what the person saw. */
export async function removeComplianceRule(index: number, text: string): Promise<Result> {
  const user = await requireRole("ADMIN");
  const rules = parseRules(user.organization.complianceRules);
  if (rules[index] !== text) return { ok: false, error: "stale" };
  rules.splice(index, 1);
  await db.organization.update({ where: { id: user.organizationId }, data: { complianceRules: serializeRules(rules) || null } });
  await audit(user, "compliance.remove", undefined, { rule: text });
  revalidatePath("/settings");
  return { ok: true };
}
