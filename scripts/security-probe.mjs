/**
 * Break-in attempts against the LIVE production site (read-only probes plus
 * expected-rejection POSTs). Every check must come back "blocked/rejected".
 * Usage: node scripts/security-probe.mjs
 */
const BASE = "https://student-hub-uet.vercel.app";
let pass = 0, fail = 0;
const results = [];

function check(name, ok, detail = "") {
  if (ok) { pass++; results.push(`PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; results.push(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

// --- 1. Security headers present ---
const home = await fetch(BASE);
const h = home.headers;
check("HSTS", /max-age=63072000/.test(h.get("strict-transport-security") ?? ""));
check("X-Frame-Options DENY", h.get("x-frame-options") === "DENY");
check("nosniff", h.get("x-content-type-options") === "nosniff");
check("CSP present", (h.get("content-security-policy") ?? "").includes("default-src 'self'"));
check("powered-by hidden", h.get("x-powered-by") === null);

// --- 2. Admin route locked (guest) ---
const admin = await fetch(`${BASE}/admin`, { redirect: "manual" });
check("/admin guest redirect", [301, 302, 303, 307, 308].includes(admin.status) && (admin.headers.get("location") ?? "").includes("/login"), `status=${admin.status}`);

// --- 3. Admin API locked (guest) ---
const mc = await fetch(`${BASE}/api/admin/message-count`);
check("/api/admin/message-count guest -> 401/403", mc.status === 401 || mc.status === 403, `status=${mc.status}`);

// --- 4. Webhook rejects forged signature ---
const wh = await fetch(`${BASE}/api/webhooks/resend`, {
  method: "POST",
  headers: { "content-type": "application/json", "svix-id": "fake", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,deadbeef" },
  body: JSON.stringify({ type: "email.delivered", data: {} }),
});
check("webhook forged signature -> 401", wh.status === 401, `status=${wh.status}`);

// --- 5. Upload route: no auth ---
const up = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { origin: BASE, host: "student-hub-uet.vercel.app" }, body: "x" });
check("/api/upload unauthenticated -> 401/400", [401, 400].includes(up.status), `status=${up.status}`);

// --- 6. Cross-origin upload rejected ---
const upCsrf = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { origin: "https://evil.example" }, body: "x" });
check("/api/upload cross-origin -> 403", upCsrf.status === 403, `status=${upCsrf.status}`);

// --- 7. Malformed UUID ids -> 404, not 500 ---
const badUuid = await fetch(`${BASE}/api/download/not-a-uuid`);
check("download bad uuid -> 404", badUuid.status === 404, `status=${badUuid.status}`);

// --- 8. Analytics: garbage body doesn't crash (204 always) ---
const analytics = await fetch(`${BASE}/api/analytics`, { method: "POST", body: "{{{not json" });
check("analytics garbage body -> 204", analytics.status === 204, `status=${analytics.status}`);

// NOTE: no XSS/SQLi/path-traversal payloads here ON PURPOSE — the middleware
// permanently auto-blocks matching IPs (working as designed), and this probe
// may run from the owner's own network. Those checks were verified manually:
// React escapes rendered user input; SQL is parameterized; wildcards are
// escaped via escapeLike; traversal shapes 403 at the edge.

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
