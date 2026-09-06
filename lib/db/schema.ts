import { pgTable, uuid, text, integer, timestamp, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name'),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  image: text('image'),
  emailVerified: timestamp('email_verified'),
  verificationToken: text('verification_token'),
  resetToken: text('reset_token'),
  resetTokenExpiry: timestamp('reset_token_expiry'),
  // Policy consent audit trail (set at signup / first OAuth sign-in)
  acceptedTermsAt: timestamp('accepted_terms_at'),
  termsVersion: text('terms_version'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  // Property names below MUST match Auth.js AdapterAccount (snake_case) —
  // @auth/drizzle-adapter inserts the provider payload as-is.
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => ({
  // Canonical Auth.js shape: one link per (provider, provider account).
  // The adapter looks accounts up by exactly this pair.
  compoundKey: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
});

export const verificationTokens = pgTable('verificationTokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires').notNull(),
});

export type User = InferSelectModel<typeof users>;

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  subject: text('subject').notNull(),
  fileUrl: text('file_url').notNull(),
  fileKey: text('file_key').notNull(), // R2 object key
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'cascade' }),
  professor: text('professor'),
  department: text('department'),
  downloads: integer('downloads').default(0).notNull(),
  likes: integer('likes').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Resource = InferSelectModel<typeof resources>;

export const likes = pgTable('likes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  unq: uniqueIndex('likes_user_resource_unique').on(table.userId, table.resourceId),
}));

export type Like = InferSelectModel<typeof likes>;

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Message = InferSelectModel<typeof messages>;

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }).notNull(),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  reason: text('reason').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Report = InferSelectModel<typeof reports>;

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  lastRequest: timestamp('last_request'),
  expiresAt: timestamp('expires_at').notNull(),
});

export type RateLimit = InferSelectModel<typeof rateLimits>;

export const blockedIps = pgTable('blocked_ips', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ip: text('ip').notNull().unique(),
  reason: text('reason').notNull(),
  type: text('type').default('attack'), // 'attack' (auto) or 'manual'
  blockedAt: timestamp('blocked_at').defaultNow().notNull(),
  blockedBy: text('blocked_by').notNull(), // 'system' or admin email
});

export type BlockedIp = InferSelectModel<typeof blockedIps>;

export const adminEmails = pgTable('admin_emails', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

export type AdminEmail = InferSelectModel<typeof adminEmails>;

export const emailEvents = pgTable('email_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  resendId: text('resend_id').unique(), // svix message ID for idempotency
  eventType: text('event_type').notNull(), // e.g. email.delivered, email.bounced
  emailId: text('email_id'), // Resend email ID
  from: text('from'),
  to: text('to'),
  subject: text('subject'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  eventData: text('event_data'), // JSON-serialised payload for debugging
});

export type EmailEvent = InferSelectModel<typeof emailEvents>;

export const suppressedEmails = pgTable('suppressed_emails', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  reason: text('reason').notNull(), // 'bounced', 'complained'
  sourceEmailId: text('source_email_id'), // Resend email ID that triggered it
  suppressedAt: timestamp('suppressed_at').defaultNow().notNull(),
});

export type SuppressedEmail = InferSelectModel<typeof suppressedEmails>;

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  resources: many(resources),
  likes: many(likes),
  reports: many(reports),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  uploader: one(users, {
    fields: [resources.uploaderId],
    references: [users.id],
  }),
  likes: many(likes),
  reports: many(reports),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
  resource: one(resources, {
    fields: [likes.resourceId],
    references: [resources.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  resource: one(resources, {
    fields: [reports.resourceId],
    references: [resources.id],
  }),
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
  }),
}));
