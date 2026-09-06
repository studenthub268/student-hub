"use server";

import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit";
import { Resend } from "resend";

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

  // 4. Notify admins by email so messages surface outside the admin panel.
  //    Best-effort: a mail failure must not fail the contact form — the
  //    message is already safely stored in the DB.
  await notifyAdminsOfMessage(validatedData).catch((e) =>
    console.error("[Contact] admin notification failed:", e)
  );

  return { success: true };
}

async function notifyAdminsOfMessage(msg: { name: string; email: string; message: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // email not configured — admin panel still shows it

  const admins = await db.query.adminEmails.findMany();
  if (admins.length === 0) return;

  const from = process.env.EMAIL_FROM || "Student Hub <noreply@studenthub.dev>";
  const resend = new Resend(apiKey);

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  await resend.emails.send({
    from,
    // Reply-To lets you answer the student directly from your mail app
    replyTo: msg.email,
    to: admins.map((a) => a.email),
    subject: `New contact message from ${msg.name}`,
    text: `Name: ${msg.name}\nEmail: ${msg.email}\n\n${msg.message}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="font-size:18px;color:#111;">New contact message</h2>
        <p style="color:#555;font-size:14px;margin:4px 0;"><strong>${escape(msg.name)}</strong> &lt;${escape(msg.email)}&gt;</p>
        <div style="background:#f4f4f5;border-radius:12px;padding:16px;margin-top:12px;white-space:pre-wrap;font-size:14px;color:#111;">${escape(msg.message)}</div>
      </div>`,
  });
}
