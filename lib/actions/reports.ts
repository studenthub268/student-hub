"use server";

import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit";
import { runAsUser } from "@/lib/db/scoped";

const reportSchema = z.object({
  resource_id: z.string().uuid(),
  reason: z.string().min(3).max(60),
  description: z.string().min(5).max(1000),
});

export async function submitReport(formData: { resource_id: string; reason: string; description: string }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Authentication required");

  // Rate limit (5 reports per day per user).
  const isAllowed = await checkRateLimit(`report:${userId}`, 5, 86400);
  if (!isAllowed) throw new Error("Report limit reached for today.");

  // Validate before the DB sees anything.
  const validatedData = reportSchema.parse(formData);

  // RLS-scoped: the row can only carry this user's reporter_id, enforced by
  // the database itself, not just the code path.
  await runAsUser(userId, (sql) => [
    sql`insert into reports (resource_id, reporter_id, reason, description)
        values (${validatedData.resource_id}, ${userId}, ${validatedData.reason}, ${validatedData.description})`,
  ]);

  return { success: true };
}
