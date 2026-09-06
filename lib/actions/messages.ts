"use server";

import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit";

const messageSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  message: z.string().min(10).max(1000),
});

export async function sendMessage(formData: { name: string; email: string; message: string }) {
  // 1. Rate Limit Check (e.g. 3 messages per hour per email)
  const isAllowed = await checkRateLimit(`contact:${formData.email}`, 3, 3600);
  if (!isAllowed) {
    throw new Error("Too many messages. Please try again later.");
  }

  // 2. Validate
  const validatedData = messageSchema.parse(formData);

  // 3. Insert
  await db.insert(messages).values({
    name: validatedData.name,
    email: validatedData.email,
    message: validatedData.message,
  });

  return { success: true };
}
