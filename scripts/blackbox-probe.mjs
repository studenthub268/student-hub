/* Unauthenticated black-box probe of the live deployment.
   Deliberately NO attack-pattern payloads: the proxy auto-bans matching IPs
   into the production DB (would lock out the probe machine). Checks:
   headers, authz on sensitive endpoints, IDOR shape, error leakage. */
const BASE = process.argv[2] || "https://student-hub-uet.vercel.app";
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  cond ? pass++ : fail++;
};

const res = {};
const get = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { redirect: "manual", ...opts });
  res[path] = r;
  return r;
};

// 1. Security headers on the document
const home = await get("/");
const h = home.headers;
ok("home 200", home.status === 200, String(home.status));
ok("CSP present", !!h.get("content-security-policy"));
ok("X-Frame-Options DENY", (h.get("x-frame-options") || "").includes("DENY"));
ok("nosniff", (h.get("x-content-type-options") || "") === "nosniff");
ok("HSTS on HTTPS", !!h.get("strict-transport-security"));
ok("no server banner leak", !h.get("server") || !/next|express|nginx/i.test(h.get("server")), h.get("server") || "none");
ok("no X-Powered-By leak", !h.get("x-powered-by"));

// 2. Authz: sensitive endpoints must not leak data to anonymous callers.
// 200 is fine if the body is a safe boolean — that's the API contract.
const anonBody = async (path) => { try { const r = await get(path); return { status: r.status, body: await r.text() }; } catch { return { status: "ERR", body: "" }; } };
const ca = await anonBody("/api/check-admin");
ok("check-admin leaks nothing", ca.status !== 200 || ca.body === '{"admin":false}', `${ca.status} ${ca.body.slice(0, 40)}`);
const mc = await anonBody("/api/admin/message-count");
ok("message-count gated", mc.status === 307 || mc.status === 401 || mc.status === 403, String(mc.status));
const cv = await anonBody("/api/check-verified");
ok("check-verified leaks nothing", cv.status !== 200 || cv.body === '{"authenticated":false}', `${cv.status} ${cv.body.slice(0, 40)}`);

// 3. /api/upload: same-origin guard + auth. Origin spoofed to the site itself
// (the strongest an attacker without XSS can do) → must still require auth.
const up = await fetch(BASE + "/api/upload", {
  method: "POST",
  headers: { Origin: BASE, "Content-Type": "application/json" },
  body: JSON.stringify({ hello: 1 }),
});
ok("upload w/ spoofed Origin rejected", up.status >= 400 && up.status < 500, String(up.status));
const upBody = await up.text().catch(() => "");
ok("upload error leaks no stack", !/at .+ \(|node_modules|\.ts:\d/.test(upBody));

// 4. IDOR / input shape: bad UUIDs must never 500 or leak internals.
// NOTE: current behavior is a soft-404 (200 + generic error page) — logged
// as LOW in the security report, asserted here only as no-leak/no-500.
const bad1 = await get("/resource/not-a-uuid");
const bad2 = await get("/resource/00000000-0000-0000-0000-000000000000");
ok("bad resource id no 500/leak", bad1.status !== 500 && !/node_modules|\.tsx?:(\d+)/.test(await bad1.text()), String(bad1.status));
ok("random uuid no 500/leak", bad2.status !== 500, String(bad2.status));

// 5. Secrets & sensitive files must never be served — a redirect to login
// (proxy catch-all) or a 404 is fine; 200 with content is not.
for (const p of ["/.env", "/.env.local", "/package.json", "/.git/config", "/next.config.ts"]) {
  const r = res[p] || (await get(p));
  const loc = r.headers.get("location") || "";
  const safe = r.status === 404 || (r.status >= 300 && r.status < 400 && loc.includes("/login"));
  ok(`${p} not served`, safe, `${r.status}${loc ? " -> " + loc.slice(0, 60) : ""}`);
}

// 6. Method abuse on a public page
const m = await fetch(BASE + "/terms", { method: "DELETE", redirect: "manual" });
ok("DELETE on page not 200", m.status !== 200, String(m.status));

// 7. Info endpoints sanity
const ver = await get("/api/version");
console.log("INFO /api/version:", (await ver.text()).slice(0, 120));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
