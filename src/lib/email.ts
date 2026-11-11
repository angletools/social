import nodemailer from "nodemailer";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Sends mail through SMTP_URL (e.g. smtps://user:pass@smtp.example.com). No-op when unset. */
export async function sendEmail(to: string[], subject: string, text: string) {
  if (!process.env.SMTP_URL || to.length === 0) return false;
  transport ??= nodemailer.createTransport(process.env.SMTP_URL);
  await transport.sendMail({ from: process.env.EMAIL_FROM ?? "Rasd <alerts@rasd.local>", to, subject, text });
  return true;
}
