# Deploying Student Hub to Vercel

The project is already optimized for Vercel — every push to `main` auto-deploys once connected. Follow these steps for a working production deployment.

---

## 1. Import the project

1. Go to [vercel.com/new](https://vercel.com/new).
2. Connect your GitHub account and select **abubakar826/student-hub**.
3. Click **Import**. Vercel auto-detects Next.js — leave the build settings as-is (`npm run build`, output auto-detected).
4. **Before clicking Deploy**, add the environment variables (step 2), or add them now and redeploy later.

## 2. Configure environment variables

Add these in **Project → Settings → Environment Variables** (production scope minimum; add to Preview too if you want preview deploys to work):

| Variable | Value / where to get it | Required |
|---|---|---|
| `DATABASE_URL` | Neon Console → Project → Connection Details → **Pooled** connection string. Add `?sslmode=require` if missing. | ✅ |
| `AUTH_SECRET` | Generate with `openssl rand -base64 32` (use a *different* value than local/dev) | ✅ |
| `AUTH_URL` | Your production URL, e.g. `https://student-hub-xxx.vercel.app` (no trailing slash) | ✅ |
| `APP_URL` | Same as `AUTH_URL` — used in email links & metadata (server-side only, no `NEXT_PUBLIC_` prefix needed) | ✅ |
| `R2_ACCOUNT_ID` | Cloudflare Dashboard → account ID | ✅ |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 → Manage R2 API Tokens | ✅ |
| `R2_SECRET_ACCESS_KEY` | Same place as above | ✅ |
| `R2_BUCKET_NAME` | Your R2 bucket name | ✅ |
| `R2_PUBLIC_URL` | Public bucket URL (`https://<bucket>.<account>.r2.dev`) | ✅ |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) | ✅ |
| `EMAIL_FROM` | Verified sender, e.g. `Student Hub <noreply@yourdomain.com>` | ✅ |
| `RESEND_WEBHOOK_SECRET` | Resend Dashboard → Webhooks | ✅ |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Your GitHub OAuth app | ✅ (if GitHub login used) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app | Optional |

> **Important:** the Neon database must be reachable from Vercel. Use the **pooled** connection string (Neon's serverless driver over HTTPS) — Neon free-tier projects work out of the box with Vercel.

## 3. Point the OAuth apps at production

For each OAuth provider, update the callback URL to your production domain:

- **GitHub OAuth app:** `https://your-app.vercel.app/api/auth/callback/github`
- **Google OAuth client:** `https://your-app.vercel.app/api/auth/callback/google`

If you sign in with email/password only (no OAuth), you can skip this.

## 4. Run the database migrations

Migrations are **not** applied automatically on deploy. From your machine with `DATABASE_URL` set to the *production* Neon string:

```bash
npm run db:migrate
```

Or apply the SQL in `drizzle/` from the Neon SQL editor.

## 5. Deploy

1. Click **Deploy** in Vercel (or, if the project was already imported without env vars, go to **Deployments → ⋯ → Redeploy** after adding them).
2. Every subsequent `git push origin main` triggers an automatic production deploy; PRs get preview deployments.

To deploy from the CLI instead:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

## 6. Post-deploy checklist

- [ ] Site loads at the `*.vercel.app` URL (or your custom domain: **Settings → Domains**)
- [ ] Login / signup works (check `AUTH_URL` and OAuth callback URLs match the live domain)
- [ ] File upload works (R2 keys + `R2_PUBLIC_URL` are for the production bucket) **with a file over ~1 MB** — small files pass even when the size ceiling is wrong, so a 50 KB test proves nothing
- [ ] Password-reset / verification emails send and use `APP_URL` in their links
- [ ] Resend webhook points at `https://your-app.vercel.app/api/webhooks/resend`
- [ ] Admin panel is reachable only for your admin emails
- [ ] `robots.txt` and `sitemap.xml` reflect the production domain

## 7. Raising the file size ceiling

The upload path is browser → `/api/upload` (a Vercel Function) → R2, so it is
bounded by Vercel's 4.5 MB Function body limit (and `/api/download` is bounded
by the same limit on responses). `MAX_FILE_SIZE` in `lib/uploads.ts` is set to
4 MB so that every file the site accepts can also be downloaded back.

To genuinely support larger files you have to take the bytes off the Function
path in **both** directions:

1. **Upload** — issue a presigned PUT URL from a route handler and have the
   browser PUT straight to R2 (`@aws-sdk/s3-request-presigner`). No bytes
   through the Function, so no body limit. This needs a one-time bucket CORS
   rule allowing `PUT` from the site's origin, otherwise the browser blocks the
   request before it is sent (the local `.env.local` bucket currently sends no
   CORS headers at all).
2. **Download** — return a redirect to the public object URL instead of
   streaming the body through `/api/download`, so the response size stops
   mattering.

Then raise `MAX_FILE_SIZE` and the copy in `app/upload/UploadForm.tsx` (which
reads the constant) to the new value.

## 8. Troubleshooting

| Symptom | Likely fix |
|---|---|
| 500 on every page / "DATABASE_URL missing" | Env var not set in the *Production* scope — set it and redeploy |
| Login redirects loop | `AUTH_URL` doesn't match the actual production URL |
| OAuth "redirect_uri mismatch" | Callback URL in the OAuth app doesn't match the live domain |
| Uploads fail with "Upload failed" and the file is large | Vercel caps a Function's request body at 4.5 MB — files over `MAX_FILE_SIZE` (`lib/uploads.ts`, currently 4 MB) are rejected at the edge. Lower the file size, or see *Raising the file size ceiling* below |
| Uploads fail for every file | R2 credentials/bucket wrong, or `R2_PUBLIC_URL` not public |
| Downloads fail or truncate on big files | Same 4.5 MB ceiling on Function *responses* — `/api/download` streams through a Function |
| Emails not sending | `RESEND_API_KEY` missing or `EMAIL_FROM` domain not verified in Resend |
