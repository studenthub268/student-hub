"use server";

import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit";

const reportSchema = z.object({
  resource_id: z.string().uuid(),
  reason: z.string().min(3),
  description: z.string().min(5).max(1000),
});

export async function submitReport(formData: { resource_id: string; reason: string; description: string }) {
  const session = await auth();
  if (!session?.user) throw new Error("Authentication required");

  // 2. Rate Limit (e.g. 5 reports per day)
  const isAllowed = await checkRateLimit(`report:${session.user.id}`, 5, 86400);
  if (!isAllowed) throw new Error("Report limit reached for today.");

  // 3. Validate
  const validatedData = reportSchema.parse(formData);

  // 4. Insert
  await db.insert(reports).values({
    resourceId: validatedData.resource_id,
    reporterId: session.user.id,
    reason: validatedData.reason,
    description: validatedData.description,
  });

  return { success: true };
}
