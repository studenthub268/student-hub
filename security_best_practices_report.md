# Security Review — Student Hub (Next.js 16.2.6 App Router / React 19 / NextAuth v5 / Drizzle+Postgres / R2 / Resend)

**Date:** 2026-09-11 · **Scope:** full codebase (`app/`, `components/`, `lib/`, `proxy.ts`, `next.config.ts`, dependencies, git history)
**Method:** manual audit against Next.js 16 server / React 19 frontend security specs + OWASP baseline; `npm audit`; git-history secret scan.

## Executive summary

The codebase is well above average on security fundamentals: no committed secrets, no client-bundled secrets, UUID primary keys everywhere, parameterized queries throughout, webhook signature verification on the raw body, DB-backed rate limiting on all sensitive actions, defense-in-depth on admin authorization, safe upload handling to an external object store, and a mostly strong CSP with good security headers. No SQL-injection, XSS-sink, or open-redirect vulnerabilities were found.

The most urgent issue is **dependency-level**: `npm audit` flags the installed `next@16.2.6` as CRITICAAL with a non-breaking patch release available (16.3.4). After that, the highest-value fix is a **one-line change to how the client IP is derived** — the current implementation trusts a client-spoofable header value, which undermines both rate limiting and the permanent IP auto-block feature.

---

## CRITICAL

### C-1 · `next@16.2.6` — known-vulnerable Next.js release (dependency advisory)
- **Severity:** Critical (known-vulnerable framework version)
- **Location:** `package.json` (`"next": "16.2.6"`), `package-lock.json`
- **Evidence:** `npm audit` reports `next` CRITICAL, fix available: `next@16.3.4` (semver-compatible, non-breaking). The audit also flags `sharp` (HIGH, image optimizer — matches GitHub Advisory GHSA-f88m-g3jw-g9cj) and `postcss` (HIGH) as inherited by `next`, all resolved by the same bump.
- **Impact:** A publicly known framework vulnerability with published advisories is reachable on production; exploit details are public and patching is routine.
- **Fix:** `npm install next@16.3.4` → run `npm run build` → verify smoke flows (auth, upload, browse) → deploy. One command, no breaking change.
- **False-positive check:** none needed — the fix is non-breaking and audit is explicit.

## HIGH

### H-1 · Client-spoofable IP used for rate limiting and permanent blocking
- **Severity:** High
- **Location:** `lib/ip-block.ts:82-88` (`getIpAddress`), consumed by `proxy.ts:42,48,64`
- **Evidence:**
  ```ts
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();   // ← leftmost = attacker-controlled
  }
  ```
- **Impact:** Anyone can send arbitrary `X-FORWARDED-FOR: <fake-ip>` on every request. This (a) makes the per-IP rate limiter (`checkRateLimit`) and block list evadable by rotating fake IPs, and (b) enables **framing**: an attacker can deliberately send attack-pattern requests (e.g. `?q=<script>`) with a victim's IP in XFF and get that victim — or a shared campus NAT — permanently auto-blocked (the block is inserted into the DB and never expires).
- **Fix:** Take the **rightmost** XFF entry (the value appended by your own trusted edge — Vercel), not the leftmost:
  ```ts
  return forwarded.split(",").pop()!.trim();
  ```
  Same one-line shape for the `x-real-ip` fallback (only meaningful behind your proxy). A test asserting `getIpAddress` picks the rightmost entry closes it.
- **Note:** verify at runtime that Vercel overwrites (not appends-to-end-only) XFF; Vercel's edge guarantees the last entry it appends is its own trusted value.

### H-2 · Over-broad attack patterns cause permanent lockouts of real users
- **Severity:** High (availability + permanent false blocks)
- **Location:** `lib/ip-block.ts:39` (`` /`.*`/ `` backtick pattern), `lib/ip-block.ts:42-43` (`;\s*ls`, `|\s*cat`), and the permanent-block behavior at `proxy.ts:48-57`
- **Evidence:** `detectAttack` runs on every URL+UA and a match **permanently** inserts the IP into `blocked_ips`. The backtick regex matches any request containing a single backtick (a normal character in search queries, filenames, markdown), `; ls`/`| cat` are plausible in past-paper titles/searches.
- **Impact:** One innocent search (`what is ```` in bash?`) = permanent site ban for that IP — a shared NAT bans a whole classroom, silently, forever. This is the same class of false-positive the file's own comment says killed users before (`' -- #` patterns were already removed for exactly this reason).
- **Fix:** Delete the backtick pattern and the `; ls` / `| cat` variants (keep `; cat`, `; wget`, `; curl` which are far less ambiguous); optionally give auto-blocks an expiry (e.g. `expires_at` 7 days) while keeping manual admin blocks permanent. 

## MEDIUM

### M-1 · Admin server actions accept unvalidated strings into security-sensitive tables
- **Severity:** Medium
- **Location:** `lib/actions/admin.ts:115` (`addAdminEmail`), `lib/actions/admin.ts:126` (`blockIp`)
- **Evidence:** `addAdminEmail(email: string)` inserts the raw string into `admin_emails` (no format check, no lowercase normalization — a later `isPermanentAdmin`/`isAdmin` compare is `.toLowerCase()`-based, but the inserted row may contain whitespace/uppercase variants); `blockIp(ip, reason)` accepts any string as an IP. These rows drive **every request** through `proxy.ts` (block list) and every admin authorization check.
- **Impact:** A typo or malformed value (paste with trailing space/newline, `"1.2.3.4 "` with non-breaking space, an invalid IP) silently degrades the security controls: a malformed admin email means an admin that can't actually be authorized; a malformed IP is a permanent junk row in a table scanned per-request.
- **Fix:** zod-validate at the boundary: `z.string().email()` for the admin email (+ `.trim().toLowerCase()` before insert), `z.string().ip()` for the blocked IP. Small diff, matches the project's existing zod usage in `lib/actions/resources.ts:20` and `messages.ts:8`.

### M-2 · CSP relies on `unsafe-inline` for scripts
- **Severity:** Medium (defense-in-depth debt, not a live vuln — React escapes all output and no raw-HTML sinks exist)
- **Location:** `next.config.ts:9,49`
- **Evidence:** `script-src 'self' 'unsafe-inline' …` (documented in-file as deliberate; nonce-based CSP noted as "the next hardening step").
- **Impact:** Any future XSS-class bug (a dependency, an embedding mistake) is fully exploitable; with a nonce-CSP the same bug would be contained.
- **Fix (when ready):** adopt Next.js nonce-based CSP via proxy middleware (the project already has `proxy.ts` wired). Until then the in-file comment correctly documents the tradeoff.

### M-3 · `/api/upload` accepts cross-site POSTs (no Origin check)
- **Severity:** Medium
- **Location:** `app/api/upload/route.ts:10` (POST handler)
- **Evidence:** The handler authenticates via session cookie but performs no Origin/Referer validation. Server Actions are protected by Next.js's built-in Origin check, but Route Handlers are not — per the Next.js security spec, they are the "escape hatch" requiring explicit CSRF decisions. Mitigations already present: SameSite=Lax session cookies (default) block most cross-site POSTs; R2 PUT is the only side effect.
- **Impact:** A niche CSRF (browser without Lax enforcement, or subdomain involvement) could upload files into the victim's storage quota and publish resources in their name.
- **Fix:** One guard at the top of the handler: reject when `request.headers.get("origin")` is present and not same-origin. Three lines, no functionality change.

## LOW

### L-1 · `X-XSS-Protection: 1; mode=block` header is obsolete
- **Location:** `next.config.ts:26`, `proxy.ts:141`
- **Evidence:** The header has been ignored by all modern browsers for years; harmless but dead weight alongside a real CSP.
- **Fix:** Optional cleanup; no urgency.

### L-2 · Session lifetime is the NextAuth default (30 days) with no rotation on privilege change
- **Location:** `lib/auth.ts:79` (`session: { strategy: 'jwt' }`)
- **Evidence:** JWT sessions are opaque, HttpOnly and SameSite=Lax (NextAuth defaults), so the basics hold; but an admin session lasts 30 days and isn't shortened or rotated when a user is promoted/demoted to admin.
- **Fix (optional):** shorten `maxAge` to 7 days, or include `emailVerified`/admin state in the JWT claim rather than trusting the token for the session's life. Admin actions already re-check `isAdmin()` server-side every call, so practical exposure is limited to ordinary user actions.

## Verified clean (no action)

- **Secrets:** none hardcoded; `.env.local` not in git; `git log --all` history scan for committed secrets = clean; `.env.example` contains only placeholders.
- **XSS:** zero `dangerouslySetInnerHTML`/`innerHTML` sinks; React-escaped rendering throughout; uploaded files served from separate R2 origin, never inline HTML.
- **SQL injection:** all queries via Drizzle parameterized builder; the one raw SQL block (`rate-limit.ts`, `deleteMyAccount`) uses tagged `sql` template with bound parameters.
- **Webhooks:** Resend/Svix signature verified over the **raw** body (`app/api/webhooks/resend/route.ts:31-46`) — textbook-correct.
- **AuthZ:** every server action and route handler re-checks session + admin status server-side; proxy admin gate re-checks DB; failures close.
- **Rate limiting:** present at proxy (per-IP, in-memory) and per-action (DB, race-free CTE) on signup/login/reset/contact/likes/reports/account-deletion.
- **Input validation:** zod schemas on upload, contact, and message flows; password strength + enumeration-safe resets + re-auth on account deletion.
- **Email links:** built from `APP_URL` env, never from `Host`/`x-forwarded-host` headers.
- **IDs:** UUIDv4 primary keys on all tables; resource URLs unguessable.
- **Cookies/session:** NextAuth defaults (HttpOnly, SameSite=Lax, auto-Secure on HTTPS).
- **CORS:** not enabled anywhere (same-origin by default) — correct.
- **Logging:** no secrets/tokens/credentials logged; generic client errors, details server-side.

## Pre-deployment checklist score

| Area | Status |
|---|---|
| Secrets management | ✅ pass |
| Input validation | ✅ pass (M-1 gap on admin actions) |
| SQL injection | ✅ pass |
| XSS | ✅ pass (M-2 CSP debt) |
| CSRF | ✅ pass (M-3 gap on one route handler) |
| AuthN/AuthZ | ✅ pass |
| Rate limiting | ✅ pass (H-1 weakens its IP basis) |
| Sensitive data exposure | ✅ pass |
| Dependencies | ❌ **fail — C-1** |
| Headers/CSP | ✅ pass with documented debt |
| File uploads | ✅ pass |

## Recommended fix order

1. **C-1** — `npm install next@16.3.4`, build, verify, deploy. (minutes)
2. **H-1** — one-line rightmost-XFF fix + tiny test. (minutes)
3. **H-2** — drop the backtick/ls patterns; consider block expiry. (minutes)
4. **M-1** — zod-validate admin action inputs. (small)
5. **M-3** — same-origin guard on `/api/upload`. (small)
6. **M-2** — nonce-based CSP (bigger; schedule separately).
