#!/usr/bin/env node
/**
 * Browse search & filter smoke test — run against a live dev server.
 *
 * Verifies that /browse search and filter parameters return the expected
 * results from the live database, and that public infra routes are not
 * redirect-gated (the "script behind a redirect" bug class).
 *
 * Usage:
 *   node scripts/smoke-browse.mjs [baseUrl]     (default http://localhost:3000)
 *
 * Exit code 0 = all checks passed, 1 = at least one failure.
 *
 * Phases:
 *   1. HTTP/SSR — result counts vs the database, route guards, SSR pill badges
 *   2. UI (headless Chrome via playwright-core + system Chrome) — reads the
 *      per-pill count badges from the rendered DOM, verifies they match the
 *      database, exercises pill clicks and debounced search end to end
 *
 * Safety notes:
 *  - Stays well under the proxy rate limit (100 req/min per IP).
 *  - Only sends sanitized query values — never quotes/hashes/dashes —
 *    because the proxy auto-blocks IPs that send attack-pattern strings.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3000";
config({ path: ".env.local" });

// ── Report helpers shared by both phases ──────────────────────────────────
const allResults = [];
let failures = 0;

function check(name, pass, detail = "") {
  allResults.push({ name, pass, detail });
  if (!pass) failures++;
}

/** Fetch a page without following redirects. */
async function get(path, init = {}) {
  return fetch(`${BASE}${path}`, { redirect: "manual", ...init });
}

/** Extract the rendered result count from SSR HTML. */
function shownCount(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
  const m = text.match(/Showing\s+(\d+)\s+resources?/);
  return m ? Number(m[1]) : null;
}

/** Number of resource cards rendered in the SSR HTML. */
function cardCount(html) {
  const matches = html.match(/href="\/resource\/[0-9a-f-]{36}"/g);
  return matches ? matches.length : 0;
}

/**
 * Extract per-pill counts from the SSR HTML: maps label → badge number for
 * type pills (All Types, Assignment, Quiz, …) and subject pills.
 */
function pillCounts(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const pills = {};
  const re = /<button[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    const label = inner.replace(/<[\s\S]*?<.*?>/g, " ").replace(/\s+/g, " ").trim();
    const badge = inner.match(/>\s*(\d+)\s*<\/span>/);
    if (badge && label) pills[label] = Number(badge[1]);
  }
  return pills;
}

// ── Database mirror of the server query (app/browse/page.tsx) ──────────────
async function loadDbRows() {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠  DATABASE_URL missing — skipping DB cross-checks");
    return null;
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  return sql`
    select id, title, description, type, subject, professor
    from resources limit 500
  `;
}

/** Mirror of getResources() filtering logic. */
function filterRows(rows, { q, type, subject }) {
  return rows.filter((r) => {
    if (q) {
      const needle = q.toLowerCase();
      const hay = [r.title, r.description, r.professor, r.subject]
        .filter(Boolean)
        .map((s) => s.toLowerCase());
      if (!hay.some((h) => h.includes(needle))) return false;
    }
    if (type && type !== "all" && r.type !== type) return false;
    if (subject && subject !== "all" && r.subject !== subject) return false;
    return true;
  });
}

// ── Warmup: first hit may trigger a dev-server compile ─────────────────────
async function warmup() {
  for (let i = 0; i < 30; i++) {
    const res = await get("/browse");
    if (res.status === 200) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// ── Checks ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Smoke-testing ${BASE}\n`);

  process.stdout.write("Warming up /browse … ");
  if (!(await warmup())) {
    console.error("FAILED — server did not answer 200 on /browse");
    process.exit(1);
  }
  console.log("ok");
  // 1. Public infra routes must NOT redirect (script-behind-a-redirect class)
  for (const p of ["/sw.js", "/manifest.json", "/robots.txt", "/sitemap.xml"]) {
    const res = await get(p);
    check(`public route ${p} → 200, no redirect`,
      res.status === 200 && !res.headers.get("location"),
      `got ${res.status}${res.headers.get("location") ? " + redirect" : ""}`);
  }

  // 2. Protected route must still redirect when logged out
  {
    const res = await get("/profile");
    const loc = res.headers.get("location") || "";
    check("protected /profile redirects to /login when logged out",
      res.status >= 300 && res.status < 400 && loc.includes("/login"),
      `got ${res.status} → ${loc}`);
  }

  // 2c. Nested auth pages must stay reachable while logged out. Regression:
  // the public-route list used an exact "/login" match, so the proxy bounced
  // /login/forgot-password back to /login and the button appeared dead.
  for (const p of ["/login/forgot-password", "/signup"]) {
    const res = await get(p);
    const loc = res.headers.get("location") || "";
    check(`logged-out route reachable: ${p}`,
      res.status === 200 && !loc.includes("redirectedFrom"),
      `got ${res.status}${loc ? ` → ${loc}` : ""}`);
  }

  // 2b. OAuth callback shapes must never be attack-blocked. Real OAuth
  // state/code params are random base64url and routinely contain "--" etc.;
  // a previous attack-pattern set matched those characters and auto-blocked
  // the visitor's IP — breaking every GitHub/Google login.
  {
    const oauthUrls = [
      "/api/auth/callback/github?code=abc_def-ghi&state=eyJhbGciOi--x8sKm2Qz-Jo",
      "/api/auth/callback/google?state=a.b-c_d/e~f&code=4%2F0Axxx",
      "/api/auth/session",
    ];
    for (const u of oauthUrls) {
      const res = await get(u);
      check(`OAuth-shaped URL not attack-blocked: ${u.split("?")[0]}`,
        res.status !== 403,
        `got ${res.status}`);
    }
  }

  // 3. Search & filter cases vs the database
  const rows = await loadDbRows();
  const cases = [
    { name: "no filter",                      params: {},                                        expect: "db" },
    { name: 'search "test" (title match)',    params: { q: "test" },                             expect: "db" },
    { name: 'search "discrete" (subject)',    params: { q: "discrete" },                         expect: "db", regression: true },
    { name: 'type filter notes',              params: { type: "notes" },                         expect: "db" },
    { name: 'subject filter Discrete Math',   params: { subject: "Discrete Mathematics" },       expect: "db" },
    { name: "combined q + type",              params: { q: "test", type: "notes" },              expect: "db" },
    { name: 'nonsense query shows empty',     params: { q: "zzzqqq" },                           expect: "zero" },
  ];

  for (const c of cases) {
    const qs = new URLSearchParams(c.params).toString();
    const res = await get(`/browse${qs ? `?${qs}` : ""}`);
    if (res.status !== 200) {
      check(`browse ${qs || "(none)"}`, false, `HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const shown = shownCount(html);
    const cards = cardCount(html);
    const emptyState = html.includes("No resources found");

    if (c.expect === "zero") {
      check(
        c.name,
        shown === 0 && cards === 0 && emptyState,
        `shown=${shown} cards=${cards} emptyState=${emptyState}`
      );
      continue;
    }

    if (rows === null) continue; // DB unavailable; HTTP status already checked

    const expected = filterRows(rows, c.params).length;
    const pass = shown === expected && cards === Math.min(expected, expected) && (expected > 0 ? !emptyState : emptyState);
    check(
      c.name,
      pass,
      `shown=${shown} cards=${cards} db=${expected}${c.regression && expected === 0 ? " ⚠ seed data lacks a subject-search fixture" : ""}`
    );
  }

  // 4. Explicit regression guard: subject search must find subject-only matches
  if (rows !== null) {
    const subjectOnly = rows.some(
      (r) =>
        ["title", "description", "professor"].every(
          (f) => !r[f] || !String(r[f]).toLowerCase().includes("discrete")
        ) && r.subject?.toLowerCase().includes("discrete")
    );
    if (subjectOnly) {
      const res = await get("/browse?q=discrete");
      const html = await res.text();
      check("regression: subject-only match is returned (was the client-filter bug)",
        shownCount(html) > 0,
        `shown=${shownCount(html)}`);
    } else {
      console.log("ℹ  no subject-only fixture in DB — regression check skipped (add a resource whose subject contains a word absent from its title)");
    }
  }

  // 5. Faceted pill counts must match the database.
  // Server-side faceting: type counts apply ONLY the q filter (ignoring the
  // subject facet), and vice versa — so unfiltered /browse pill counts equal
  // plain per-value counts of the whole table.
  if (rows !== null) {
    const res = await get("/browse");
    const html = await res.text();
    const pills = pillCounts(html);
    const dbTypeCounts = {};
    const dbSubjectCounts = {};
    for (const r of rows) {
      dbTypeCounts[r.type] = (dbTypeCounts[r.type] || 0) + 1;
      dbSubjectCounts[r.subject] = (dbSubjectCounts[r.subject] || 0) + 1;
    }

    const checks = [];
    for (const [label, count] of Object.entries(pills)) {
      if (label === "All Types" || label === "All Subjects") continue;
      const isType = dbTypeCounts[label] !== undefined;
      const isSubject = !isType && dbSubjectCounts[label] !== undefined;
      if (!isType && !isSubject) continue; // not a count-bearing pill
      checks.push([label, count, isType ? dbTypeCounts[label] : dbSubjectCounts[label], isType ? "type" : "subject"]);
    }
    if (checks.length === 0) {
      check("pill counts rendered", false, "no count badges found in HTML");
    }
    for (const [label, count, expected, kind] of checks) {
      check(`pill count (${kind}): ${label}`, count === expected, `pill=${count} db=${expected}`);
    }
    const allTypes = pills["All Types"];
    if (allTypes !== undefined) {
      check("pill count: All Types", allTypes === rows.length, `pill=${allTypes} db=${rows.length}`);
    }

    // Faceted cross-check: with a subject selected, type counts must ignore
    // the subject facet — compare type pill counts against per-type totals.
    {
      const someSubject = Object.keys(dbSubjectCounts)[0];
      const res2 = await get(`/browse?subject=${encodeURIComponent(someSubject)}`);
      const html2 = await res2.text();
      const pills2 = pillCounts(html2);
      check(`faceting: type pill counts ignore the subject facet (subject=${someSubject})`,
        pills2["All Types"] === rows.length,
        `All Types pill=${pills2["All Types"]} expected=${rows.length}`);
    }

    // Debounce/facets regression guard (server-side filtering era):
    // searching a subject-only word must update pill counts too.
    const subjectOnly = rows.some(
      (r) =>
        ["title", "description", "professor"].every(
          (f) => !r[f] || !String(r[f]).toLowerCase().includes("discrete")
        ) && r.subject?.toLowerCase().includes("discrete")
    );
    if (subjectOnly) {
      const res3 = await get("/browse?q=discrete");
      const html3 = await res3.text();
      const pills3 = pillCounts(html3);
      const expectedSubject = dbSubjectCounts[rows.find((r) => r.subject?.toLowerCase().includes("discrete")).subject];
      check("q-search narrows facet counts (subject-only match)",
        shownCount(html3) > 0 && pills3["All Types"] === expectedSubject,
        `shown=${shownCount(html3)} AllTypes=${pills3["All Types"]} expected=${expectedSubject}`);
    }
  }

  // ── Phase 2: real-browser UI checks ──────────────────────────────────
  if (rows === null) {
    console.log("ℹ  skipping UI phase — DATABASE_URL unavailable");
    return report();
  }
  try {
    await runUiPhase(rows);
  } catch (err) {
    check("UI phase completed", false, err.message.split("\n")[0]);
  }

  // ── Phase 3: auth flow (signup → verify → login → sign out) ─────────
  // Opt out with SMOKE_SKIP_AUTH=1. Self-cleaning: deletes its test user.
  if (process.env.SMOKE_SKIP_AUTH === "1") {
    console.log("ℹ  skipping auth phase (SMOKE_SKIP_AUTH=1)");
  } else {
    try {
      await runAuthPhase();
    } catch (err) {
      check("auth phase completed", false, err.message.split("\n")[0]);
    }
  }

  // ── Phase 4: OAuth adapter health ────────────────────────────────────
  // Regression guard for the "Server error" on Google/GitHub sign-in: the
  // adapter must use OUR tables (mappings passed in lib/auth.ts) and the
  // accounts table must keep the canonical (provider, providerAccountId) PK.
  try {
    await runOAuthPhase();
  } catch (err) {
    check("OAuth phase completed", false, err.message.split("\n")[0]);
  }
  report();
}

function report() {
  console.log("");
  for (const r of allResults) {
    console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
  }
  console.log(`\n${allResults.length - failures}/${allResults.length} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * UI phase — headless Chrome (system install, via playwright-core).
 * Reads the per-pill count badges from the rendered DOM and verifies them
 * against the database, then exercises pill clicks and debounced search.
 */
async function runUiPhase(rows) {
  const { chromium } = await import("playwright-core");

  const chromePaths = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executablePath = chromePaths.find((p) => {
    try { return existsSync(p); } catch { return false; }
  });
  if (!executablePath) throw new Error("no system Chrome found (set CHROME_PATH)");

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await page.goto(`${BASE}/browse`, { waitUntil: "domcontentloaded" });

    // Read every pill badge from the live DOM. Badge is a nested span, so
    // textContent concatenates label+digits ("All Types1").
    const domPills = await page.evaluate(() => {
      const out = {};
      for (const btn of document.querySelectorAll("button")) {
        const label = btn.textContent.replace(/\s+/g, " ").trim();
        const m = label.match(/^(.+?)(\d+)$/);
        if (m && btn.querySelector("span")) out[m[1].trim()] = Number(m[2]);
      }
      return out;
    });

    // Cross-check DOM pill badges against DB counts (unfiltered view).
    const dbTypeCounts = {};
    const dbSubjectCounts = {};
    for (const r of rows) {
      dbTypeCounts[r.type] = (dbTypeCounts[r.type] || 0) + 1;
      dbSubjectCounts[r.subject] = (dbSubjectCounts[r.subject] || 0) + 1;
    }
    const TYPE_LABELS = { "Assignment": "assignment", "Quiz": "quiz", "Past Paper": "past-paper", "Notes": "notes", "Other": "other" };

    check("UI: All Types badge matches DB",
      domPills["All Types"] === rows.length,
      `dom=${domPills["All Types"]} db=${rows.length}`);
    check("UI: All Subjects badge matches DB",
      domPills["All Subjects"] === rows.length,
      `dom=${domPills["All Subjects"]} db=${rows.length}`);

    for (const [label, typeValue] of Object.entries(TYPE_LABELS)) {
      if (domPills[label] === undefined) continue;
      check(`UI: type pill "${label}" badge matches DB`,
        domPills[label] === (dbTypeCounts[typeValue] || 0),
        `dom=${domPills[label]} db=${dbTypeCounts[typeValue] || 0}`);
    }
    let subjectChecks = 0;
    for (const [subject, expected] of Object.entries(dbSubjectCounts)) {
      if (domPills[subject] === undefined) continue;
      subjectChecks++;
      check(`UI: subject pill "${subject}" badge matches DB`,
        domPills[subject] === expected,
        `dom=${domPills[subject]} db=${expected}`);
    }
    if (subjectChecks === 0) check("UI: subject pill badges found", false, "no subject pills detected in DOM");

    // Zero-count pills must be disabled in the DOM. Faceted semantics: type
    // counts apply ONLY the q filter (they advertise what stays reachable if
    // you clear the subject), so zero-count type pills appear when a SEARCH
    // eliminates types — use one. Badge number is read from the span directly
    // (suffix matching breaks on counts like 10/20).
    const readBadges = () => page.evaluate(() => {
      const out = {};
      for (const btn of document.querySelectorAll("button")) {
        const badge = btn.querySelector("span");
        if (!badge) continue;
        const label = btn.textContent.replace(badge.textContent, "").replace(/\s+/g, " ").trim();
        const n = Number(badge.textContent.trim());
        if (!Number.isNaN(n)) out[label] = { count: n, disabled: btn.disabled };
      }
      return out;
    });

    await page.fill("input[placeholder*='title']", "");
    await page.type("input[placeholder*='title']", "discrete", { delay: 40 });
    await page.waitForURL((u) => u.searchParams.get("q") === "discrete", { timeout: 15000 });
    await page.waitForTimeout(900); // counts refresh after RSC update

    const disabledState = await readBadges();
    const zeroPills = Object.entries(disabledState).filter(([label, v]) => v.count === 0 && label !== "All Types" && label !== "All Subjects");
    const wrongDisabled = zeroPills.filter(([, v]) => !v.disabled);
    if (zeroPills.length === 0) {
      check("UI: zero-count pills disabled", false, "no zero-count pills even with q=discrete");
    } else {
      check("UI: zero-count pills disabled",
        wrongDisabled.length === 0,
        `${zeroPills.length - wrongDisabled.length}/${zeroPills.length} disabled${wrongDisabled.length ? ` — NOT disabled: ${wrongDisabled.map(([l]) => l).join(", ")}` : ""}`);
    }
    // Search must narrow the advertised facet totals — asserted against DB
    // truth (scale-independent): the All Types facet after q=discrete must
    // equal the number of DB rows matching "discrete". On a tiny DB where
    // every resource matches, that equals the total — still correct.
    const expectedNarrowed = filterRows(rows, { q: "discrete" }).length;
    check("UI: search narrows facet totals",
      (disabledState["All Types"]?.count ?? -1) === expectedNarrowed,
      `All Types=${disabledState["All Types"]?.count} expected=${expectedNarrowed} total=${rows.length}`);
    // Reset for the interaction checks below.
    await page.fill("input[placeholder*='title']", "");
    await page.waitForURL((u) => !u.searchParams.has("q") || u.searchParams.get("q") === "", { timeout: 15000 });
    await page.waitForTimeout(800);

    // Interaction: click the Discrete Mathematics pill → results + URL update.
    const discreteBtn = page.getByRole("button", { name: /Discrete Mathematics/ });
    if (await discreteBtn.count() > 0 && await discreteBtn.isEnabled()) {
      await discreteBtn.click();
      await page.waitForURL(/subject=Discrete\+Mathematics/, { timeout: 15000 });
      await page.waitForFunction(
        () => !document.querySelector(".animate-pulse"),
        undefined,
        { timeout: 15000 }
      ).catch(() => {});
      const shownAfter = await page.evaluate(() => {
        const t = document.body.innerText.match(/Showing\s+(\d+)\s+resources?/);
        return t ? Number(t[1]) : null;
      });
      const expectedForSubject = dbSubjectCounts["Discrete Mathematics"] || 0;
      check("UI: clicking subject pill updates results", shownAfter === expectedForSubject,
        `shown=${shownAfter} db=${expectedForSubject}`);

      // Clear via All Subjects pill.
      await page.getByRole("button", { name: /All Subjects/ }).click();
      await page.waitForURL(/browse$/, { timeout: 15000 });
    } else {
      check("UI: clicking subject pill updates results", false, "pill missing or disabled");
    }

    // Interaction: debounced search — one request for a multi-char type-in.
    await page.waitForFunction(() => {
      const i = document.querySelector("input[placeholder*='title']");
      return i && i.offsetParent !== null;
    }, undefined, { timeout: 15000 });
    let rscRequests = 0;
    const onRequest = (req) => { if (req.url().includes("/browse?q=")) rscRequests++; };
    page.on("request", onRequest);
    await page.fill("input[placeholder*='title']", "");
    await page.type("input[placeholder*='title']", "discrete", { delay: 50 });
    await page.waitForURL(/q=discrete/, { timeout: 15000 });
    await page.waitForTimeout(600); // let any trailing request settle
    page.off("request", onRequest);
    check("UI: debounced search fires one request", rscRequests === 1, `requests=${rscRequests}`);
    const searchShown = await page.evaluate(() => {
      const t = document.body.innerText.match(/Showing\s+(\d+)\s+resources?/);
      return t ? Number(t[1]) : null;
    });
    check("UI: search results render after debounce", searchShown !== null && searchShown > 0, `shown=${searchShown}`);
  } finally {
    await browser.close();
  }
}

/**
 * Auth phase — full signup → verify → login → navbar → sign-out cycle in a
 * real browser, with DB-level verification of the verification token and
 * self-cleanup afterwards.
 */
async function runAuthPhase() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const { chromium } = await import("playwright-core");

  const chromePaths = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executablePath = chromePaths.find((p) => existsSync(p));
  if (!executablePath) throw new Error("no system Chrome found (set CHROME_PATH)");

  const stamp = Date.now();
  const email = `smoke-${stamp}@example.com`;
  const password = "SmokeTest123";
  const name = "Smoke Tester";

  const browser = await chromium.launch({ executablePath, headless: true });
  let userId = null;

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    /** Navigate, then wait for hydration so form handlers are attached. */
    const gotoStable = async (path) => {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
    };

    // 1. Sign up via the real form.
    await gotoStable("/signup");
    await page.fill('input[placeholder="Name"]', name);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password); // fills both pw fields via nth
    const pwFields = page.locator('input[type="password"]');
    await pwFields.nth(0).fill(password);
    await pwFields.nth(1).fill(password);

    // 1b. Passive policy consent — a consent line (links to /terms) must be
    // present; submitting the form constitutes acceptance.
    const consentLine = await page.getByText("By signing up, you accept").count();
    const termsLink = await page.locator('a[href="/terms"]').count();
    check("auth: passive consent line present with terms links",
      consentLine >= 1 && termsLink >= 1,
      `line=${consentLine} links=${termsLink}`);

    await page.getByRole("button", { name: /Sign Up/ }).click();
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("Check your inbox"),
        undefined,
        { timeout: 20000 }
      );
    } catch (e) {
      // Surface what the page actually shows (toast errors render into body)
      const pageText = await page.evaluate(() =>
        document.body.innerText.replace(/\s+/g, " ").slice(0, 300)
      );
      throw new Error(`signup never showed "Check your inbox" — page says: ${pageText}`);
    }
    check("auth: signup accepted, verification prompt shown", true);

    // 2. Grab the verification token straight from the DB (email delivery is
    //    out of scope — Resend key is real and we don't send test mail).
    const rows = await sql`select id, verification_token, accepted_terms_at, terms_version from users where email = ${email}`;
    if (rows.length === 0 || !rows[0].verification_token) {
      check("auth: user persisted with verification token", false, `rows=${rows.length}`);
      return;
    }
    userId = rows[0].id;
    check("auth: user persisted with verification token", true);
    check("auth: policy consent recorded in DB (timestamp + version)",
      !!rows[0].accepted_terms_at && !!rows[0].terms_version,
      `version=${rows[0].terms_version || "null"}`);

    // 3. Login must be BLOCKED before verification.
    await gotoStable("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole("button", { name: /Sign In/ }).click();
    await page.waitForFunction(
      () => document.body.innerText.includes("verify your email"),
      undefined,
      { timeout: 15000 }
    );
    check("auth: unverified login blocked with message", true);

    // 4. Visit the verification link.
    await gotoStable(`/auth/verify-email?token=${rows[0].verification_token}`);
    await page.waitForFunction(
      () => document.body.innerText.includes("Email Verified"),
      undefined,
      { timeout: 20000 }
    );
    const verified = await sql`select email_verified from users where id = ${userId}`;
    check("auth: verify link sets email_verified in DB",
      verified[0]?.email_verified !== null,
      `email_verified=${verified[0]?.email_verified ? "set" : "null"}`);

    // 5. Login now succeeds → lands on home, logged-in navbar visible.
    await gotoStable("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    // The navbar renders guest state first and updates after its client-side
    // session fetch — so wait for that fetch to complete before judging.
    const sessionSettled = page.waitForResponse(
      (r) => r.url().includes("/api/auth/session"),
      { timeout: 20000 }
    ).catch(() => null);
    await page.getByRole("button", { name: /Sign In/ }).click();
    await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 30000 });
    await sessionSettled;
    let navWaitErr = null;
    // Logged-in marker: the user-menu BUTTON carries the avatar chip
    // (initials fallback or provider picture — both render as .rounded-full;
    // "Sign Out" text only exists inside the closed dropdown — do not use it).
    await page.waitForFunction(
      () => !!document.querySelector("nav button .rounded-full"),
      undefined,
      { timeout: 20000 }
    ).catch((e) => { navWaitErr = String(e.message).split("\n")[0]; });
    const navState = await page.evaluate(() => {
      const nav = document.querySelector("nav");
      const text = nav ? nav.innerText : "";
      return {
        loggedIn: text.includes("Sign Out") || !!Array.from(nav?.querySelectorAll("button") || []).find((b) => b.querySelector(".rounded-full")),
        getStarted: text.includes("Get Started"),
        url: location.href,
        navPresent: !!nav,
        bodyStart: document.body.innerText.slice(0, 60).replace(/\n/g, " | "),
      };
    });
    check("auth: logged-in navbar state after login", navState.loggedIn,
      JSON.stringify({ ...navState, navWaitErr }));

    // 6. Protected route reachable while logged in.
    await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    check("auth: /profile reachable when logged in",
      !page.url().includes("/login"),
      `landed on ${new URL(page.url()).pathname}`);

    // 7. Sign out → back to guest state.
    await gotoStable("/");
    const menuBtn = page.locator("nav button").filter({ has: page.locator(".rounded-full") }).first();
    if (await menuBtn.count() > 0) {
      await menuBtn.click();
      await page.waitForTimeout(500); // dropdown animation
      const signOut = page.getByText("Sign Out", { exact: true }).first();
      await signOut.waitFor({ state: "visible", timeout: 10000 });
      await signOut.click();
      // Signout POSTs, then round-trips a full page load before the guest
      // navbar renders — wait for the signout response and the guest state.
      await page.waitForResponse(
        (r) => r.url().includes("/api/auth/signout"),
        { timeout: 20000 }
      ).catch(() => {});
      await page.waitForFunction(
        () => {
          const nav = document.querySelector("nav");
          return !!nav && nav.innerText.includes("Get Started") && !nav.innerText.includes("Sign Out");
        },
        undefined,
        { timeout: 30000 }
      ).catch(() => {});
      const after = await page.evaluate(() => document.querySelector("nav")?.innerText || "");
      check("auth: sign out returns navbar to guest state",
        after.includes("Get Started") && !after.includes("Sign Out"),
        `nav=${after.replace(/\n/g, " | ").slice(0, 80)}`);
    } else {
      check("auth: sign out returns navbar to guest state", false, "user menu button not found");
    }
  } finally {
    await browser.close();
    // Self-cleanup: remove the test user (cascades to sessions/accounts).
    if (userId) {
      try {
        await sql`delete from users where id = ${userId}`;
        console.log("ℹ  auth test user deleted");
      } catch (e) {
        console.warn(`⚠  cleanup failed for ${email}: ${e.message}`);
      }
    }
  }
}

/**
 * OAuth phase — guards the "Server error" on Google/GitHub sign-in.
 *
 * History: DrizzleAdapter was called without table mappings, so it queried
 * invented tables ("user"/"account", singular) and every OAuth callback died
 * with AdapterError (42P01) → masked as "Configuration". The accounts table
 * also had a non-defaulted "id" PK, though Auth.js never passes one.
 *
 * Checks (all self-cleaning):
 *  1. accounts table shape — composite PK (provider, providerAccountId),
 *     id column gone, id_token/session_state columns present
 *  2. the adapter's exact getUserByAccount join runs without error
 *  3. the adapter's exact linkAccount insert works, and re-signin resolves
 *     the user through it (probe row deleted afterwards, cascade cleans up)
 *  4. the CSRF→POST signin handshake redirects to the real providers,
 *     never to error=Configuration
 */
async function runOAuthPhase() {
  // 1-3 need the database
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);

    // 1. canonical shape
    const pk = await sql`select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'accounts'::regclass and contype = 'p'`;
    check("OAuth: accounts PK is (provider, providerAccountId)",
      /provider.*providerAccountId/i.test(pk[0]?.def ?? ""),
      pk[0]?.def ?? "no PK found");
    const cols = await sql`select column_name from information_schema.columns
      where table_name = 'accounts'`;
    const names = cols.map((c) => c.column_name);
    check("OAuth: accounts has no legacy id column", !names.includes("id"), names.join(","));
    check("OAuth: accounts has id_token + session_state columns",
      names.includes("id_token") && names.includes("session_state"));

    // 2 + 3. replay the adapter's exact operations on a probe row
    const probeId = `smoke-oauth-${Date.now()}`;
    const testEmail = `${probeId}@example.com`;
    const lookupSql = `select "users"."id" from "accounts"
      inner join "users" on "accounts"."userId" = "users"."id"
      where ("accounts"."provider" = $1 and "accounts"."providerAccountId" = $2)`;
    const before = await sql.query(lookupSql, ["google", probeId]);
    check("OAuth: adapter getUserByAccount join runs", Array.isArray(before) && before.length === 0);
    const created = await sql.query(
      `insert into "users" ("name", "email", "email_verified") values ($1, $2, $3) returning "id"`,
      ["Smoke OAuth Probe", testEmail, null]);
    const userId = created[0].id;
    await sql.query(
      `insert into "accounts" ("userId", "type", "provider", "providerAccountId",
        "id_token", "session_state") values ($1,$2,$3,$4,$5,$6)`,
      [userId, "oauth", "google", probeId, "probe", null]);
    const after = await sql.query(lookupSql, ["google", probeId]);
    check("OAuth: linkAccount insert + user resolve works",
      after.length === 1 && after[0].id === userId);
    await sql.query(`delete from "users" where "id" = $1`, [userId]);
    console.log("ℹ  OAuth probe rows cleaned up");
  } else {
    console.log("ℹ  skipping OAuth DB checks — DATABASE_URL unavailable");
  }

  // 4. real handshake: CSRF → POST must 302 to the provider, never Configuration
  for (const provider of ["google", "github"]) {
    const csrfRes = await get("/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();
    const setCookies = csrfRes.headers.getSetCookie?.() ?? [];
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    const res = await fetch(`${BASE}/api/auth/signin/${provider}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ csrfToken }),
      redirect: "manual",
    });
    const loc = res.headers.get("location") || "";
    const ok = res.status === 302 && !loc.includes("error=Configuration") &&
      loc.startsWith("https://");
    check(`OAuth: signin/${provider} handshake reaches provider`, ok,
      `got ${res.status} → ${loc.split("?")[0] || "(none)"}`);
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err.message);
  process.exit(1);
});
