/** Creates an empty live workspace. Never converts or clears a demo workspace. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
const db = new PrismaClient();
async function main() {
  const input = z.object({
    name: z.string().trim().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
    email: z.email(), password: z.string().min(12).max(200),
  }).safeParse({ name: process.env.WORKSPACE_NAME, slug: process.env.WORKSPACE_SLUG, email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD });
  if (!input.success) throw new Error("Set WORKSPACE_NAME, WORKSPACE_SLUG, OWNER_EMAIL and OWNER_PASSWORD (12+ characters). Use a unique slug and email.");
  const { name, slug, email, password } = input.data;
  await db.organization.create({ data: { name, slug, dataMode: "LIVE", users: { create: { email: email.toLowerCase(), name: "Owner", role: "OWNER", passwordHash: await bcrypt.hash(password, 12) } } } });
  console.log("Created an empty live workspace. Sign in with the owner email. Collection requires Monid; no sample data will be generated.");
}
main().catch(() => { console.error("Could not create workspace. Check the required variables and ensure the slug and email are unused."); process.exitCode = 1; }).finally(() => db.$disconnect());
