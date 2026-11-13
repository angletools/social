import nodemailer from "nodemailer";
import { DEFAULT_SENDER } from "./workspace";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Sends mail through SMTP_URL (e.g. smtps://user:pass@smtp.example.com). No-op when unset. `from` defaults to EMAIL_FROM. */
export async function sendEmail(to: string[], subject: string, text: string, from?: string, messageId?: string) {
  if (!process.env.SMTP_URL || to.length === 0) return false;
  transport ??= nodemailer.createTransport({ url: process.env.SMTP_URL, connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000 });
  const result = await transport.sendMail({ from: from || process.env.EMAIL_FROM || DEFAULT_SENDER, to, subject, text, ...(messageId && { messageId: `<${messageId}@angle-social.local>` }) });
  return result.accepted.length === to.length && result.rejected.length === 0;
}
