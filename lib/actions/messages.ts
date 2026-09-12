"use server";

import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit";
import { headers } from "next/headers";

const messageSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email().max(254),
  message: z.string().min(10).max(1000),
});

export async function sendMessage(formData: { name: string; email: string; message: string }) {
  // 1. Validate before anything is counted or stored.
  const validatedData = messageSchema.parse(formData);

  // 2. Rate limit — per email AND per IP: an attacker can rotate fake
  //    emails freely, but both counters must pass. (3/hour each.)
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const byEmail = await checkRateLimit(`contact:${validatedData.email}`, 3, 3600);
  const byIp = await checkRateLimit(`contact-ip:${ip}`, 3, 3600);
  if (!byEmail || !byIp) {
    throw new Error("Too many messages. Please try again later.");
  }

  // 3. Insert — visible to admins via the Admin Panel → Messages tab
  await db.insert(messages).values({
    name: validatedData.name,
    email: validatedData.email,
    message: validatedData.message,
  });

  return { success: true };
}
