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
    check("protected /profile redirects to /sign-in when logged out",
      res.status >= 300 && res.status < 400 && loc.includes("/sign-in"),
      `got ${res.status} → ${loc}`);
  }

  // 2c. Legacy /login + /signup must 307-redirect to the Clerk pages (old
  // bookmarks), and /accept-token must stay reachable for email links.
  for (const [p, expect] of [["/login", "/sign-in"], ["/signup", "/sign-up"], ["/accept-token", null]]) {
    const res = await get(p);
    const loc = res.headers.get("location") || "";
    const ok = expect ? res.status >= 300 && res.status < 400 && loc.includes(expect) : res.status === 200;
    check(`legacy auth route: ${p}${expect ? ` → ${expect}` : " reachable"}`,
      ok,
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
  if (rows !== null && rows.length === 0) {
    console.log("ℹ  DB has no resources — pill/facet HTTP checks skipped");
  }
  if (rows !== null && rows.length > 0) {
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
    check("UI phase completed", false, err.message.replace(/\s+/g, " ").slice(0, 200));
  }

  // ── Phase 3: auth flow (signup → verify → login → sign out) ─────────
  // Opt out with SMOKE_SKIP_AUTH=1. Self-cleaning: deletes its test user.
  if (process.env.SMOKE_SKIP_AUTH === "1") {
    console.log("ℹ  skipping auth phase (SMOKE_SKIP_AUTH=1)");
  } else {
    try {
      await runAuthPhase();
    } catch (err) {
      check("auth phase completed", false, err.message.replace(/\s+/g, " ").slice(0, 200));
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
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
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

    // Empty DB: only assert the empty state renders, then skip every
    // data-dependent interaction check (no fixtures are seeded in CI).
    if (rows.length === 0) {
      const emptyText = await page.evaluate(() => document.body.innerText);
      check("UI: empty state renders on empty DB",
        /No resources found|Showing\s+0\s+resources/i.test(emptyText),
        emptyText.replace(/\s+/g, " ").slice(0, 80));
      console.log("ℹ  DB has no resources — UI interaction checks skipped");
      return;
    }

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
    // eliminates types — use one. Search is URL-driven on /browse (the navbar
    // popup navigates with ?q=), so navigate directly. Badge number is read
    // from the span directly (suffix matching breaks on counts like 10/20).
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

    await page.goto(`${BASE}/browse?q=zznosuchresource`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
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
    // truth (scale-independent): the All Types facet after a no-match search
    // must equal the number of DB rows matching it (0), which also exercises
    // the zero-count path deterministically without needing fixture data.
    const expectedNarrowed = filterRows(rows, { q: "zznosuchresource" }).length;
    check("UI: search narrows facet totals",
      (disabledState["All Types"]?.count ?? -1) === expectedNarrowed,
      `All Types=${disabledState["All Types"]?.count} expected=${expectedNarrowed} total=${rows.length}`);    // Reset for the interaction checks below.
    await page.goto(`${BASE}/browse`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Interaction: click a subject pill that actually exists in the DB →
    // results + URL update (subject chosen from live data, not hardcoded).
    const targetSubject = Object.keys(dbSubjectCounts).find((s) => domPills[s] !== undefined);
    const subjectBtn = targetSubject
      ? page.getByRole("button", { name: new RegExp(targetSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
      : null;
    if (subjectBtn && await subjectBtn.count() > 0 && await subjectBtn.isEnabled()) {
      await subjectBtn.click();
      await page.waitForURL((u) => u.searchParams.get("subject") === targetSubject, { timeout: 15000 });
      await page.waitForFunction(
        () => !document.querySelector(".animate-pulse"),
        undefined,
        { timeout: 15000 }
      ).catch(() => {});
      const shownAfter = await page.evaluate(() => {
        const t = document.body.innerText.match(/Showing\s+(\d+)\s+resources?/);
        return t ? Number(t[1]) : null;
      });
      const expectedForSubject = dbSubjectCounts[targetSubject] || 0;
      check("UI: clicking subject pill updates results", shownAfter === expectedForSubject,
        `subject=${targetSubject} shown=${shownAfter} db=${expectedForSubject}`);

      // Clear via All Subjects pill.
      await page.getByRole("button", { name: /All Subjects/ }).click();
      await page.waitForURL(/browse$/, { timeout: 15000 });
    } else {
      check("UI: clicking subject pill updates results", false, "pill missing or disabled");
    }    // Interaction: popup typeahead — debounced server action (one request
    // for a multi-char type-in) rendering suggestions in the dialog. The
    // navbar search pill opens the popup (SearchPopup portal).
    await page.click("nav [role='search']");
    await page.waitForSelector("div[role='dialog'] input[type='text']", { timeout: 15000 });
    let rscRequests = 0;
    const onRequest = (req) => { if (req.method() === "POST" && req.url().includes("/browse")) rscRequests++; };
    page.on("request", onRequest);
    const searchWord = (rows[0].title.split(/\s+/).find((w) => w.length >= 4) || rows[0].title).toLowerCase();
    await page.type("div[role='dialog'] input[type='text']", searchWord, { delay: 50 });
    // Suggestions render once the debounced action resolves; searchWord comes
    // from a real title, so a resource or subject match must appear.
    await page.waitForFunction(
      (word) => {
        const d = document.querySelector("div[role='dialog']");
        return !!d && d.innerText.toLowerCase().includes(word);
      },
      searchWord,
      { timeout: 15000 }
    ).catch(() => {});
    await page.waitForTimeout(600); // let any trailing request settle
    page.off("request", onRequest);
    check("UI: debounced search fires one request", rscRequests === 1, `requests=${rscRequests}`);

    const typeaheadRendered = await page.evaluate(() => {
      const d = document.querySelector("div[role='dialog']");
      return !!d && d.querySelectorAll("button").length > 0;
    });
    check("UI: typeahead renders suggestions", typeaheadRendered, `term=${searchWord} requests=${rscRequests}`);
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
  // Clerk ticket flow: a single-use sign-in token (Backend API) auto-signs
  // the test user in via /accept-token. Proves: Clerk sign-in, the Clerk→
  // Postgres bridge (clerkId self-heal), the app session mapping, and the
  // Clerk sign-out. Skips (info, not failure) without Clerk keys — CI runs
  // the identity-storage phase below instead.
  const SK = process.env.CLERK_SECRET_KEY;
  if (!SK || !process.env.CLERK_WEBHOOK_SECRET) {
    console.log("ℹ  skipping auth phase — CLERK_SECRET_KEY / CLERK_WEBHOOK_SECRET not set");
    return;
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const { chromium } = await import("playwright-core");

  const chromePaths = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executablePath = chromePaths.find((p) => existsSync(p));
  if (!executablePath) throw new Error("no system Chrome found (set CHROME_PATH)");

  const stamp = Date.now();
  const email = `smoke-${stamp}@example.com`;
  const password = "SmokeTest-" + stamp.toString(36) + "x9";
  const api = (path, opts = {}) =>
    fetch(`https://api.clerk.com/v1${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${SK}`, ...(opts.headers || {}) },
    });

  const browser = await chromium.launch({ executablePath, headless: true });
  let clerkUserId = null;
  try {
    // 1. Create a verified Clerk user.
    const form = new URLSearchParams({
      email_address: email,
      password,
      first_name: "Smoke",
      last_name: "Tester",
      verify_email: "true",
    });
    const cu = await (await api("/users", { method: "POST", body: form })).json();
    if (!cu.id) throw new Error("Clerk user creation failed: " + JSON.stringify(cu.errors?.[0]?.message || cu).slice(0, 120));
    clerkUserId = cu.id;
    check("auth: clerk test user created", true, clerkUserId);

    // 2. Sync the user into Postgres by delivering a signed user.created
    //    webhook — exactly what Clerk's configured endpoint sends in
    //    production. Proves the webhook → DB half of the bridge.
    const { Webhook } = await import("svix");
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
    const msgId = "smoke-" + stamp;
    const tsSec = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      type: "user.created",
      data: {
        id: clerkUserId,
        email_addresses: [{ id: "idn_smoke", email_address: email }],
        primary_email_address_id: "idn_smoke",
        first_name: "Smoke",
        last_name: "Tester",
        image_url: null,
        has_image: false,
      },
      timestamp: tsSec,
    });
    const wr = await fetch(`${BASE}/api/webhooks/clerk`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": msgId,
        "svix-timestamp": String(tsSec),
        "svix-signature": wh.sign(msgId, new Date(tsSec * 1000), payload),
      },
      body: payload,
    });
    check("auth: user.created webhook syncs Postgres row", wr.status === 200, `got ${wr.status}`);

    // 3. Mint a single-use sign-in token and consume it in a real browser.
    const st = await (await api("/sign_in_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 600 }),
    })).json();
    if (!st.token) throw new Error("sign-in token mint failed");

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    // The page hard-navigates (window.location.replace) once the session is
    // live, which can abort Playwright's initial-load tracking — catch that,
    // then judge by the final URL.
    await page.goto(`${BASE}/accept-token?token=${st.token}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => !new URL(u).pathname.startsWith("/accept-token"), { timeout: 30000 }).catch(() => {});
    check("auth: ticket sign-in completes", !page.url().includes("/accept-token"), new URL(page.url()).pathname);

    // 3. The navbar session probe must return the mapped DB user.
    const session = await page.evaluate(async () => {
      const r = await fetch("/api/auth/session");
      return r.json();
    });
    check("auth: app session maps Clerk → Postgres user",
      session?.user?.email === email,
      `email=${session?.user?.email ?? "none"}`);

    // 4. Protected route reachable while logged in.
    await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    check("auth: /profile reachable when logged in",
      !page.url().includes("/sign-in"),
      `landed on ${new URL(page.url()).pathname}`);

    // 5. DB bridge: self-heal stamped clerk_id + verification onto the row.
    const rows = await sql`select clerk_id, email_verified from users where email = ${email}`;
    check("auth: Clerk→Postgres bridge wrote clerk_id + verified",
      rows.length === 1 && rows[0].clerk_id === clerkUserId && rows[0].email_verified !== null,
      `rows=${rows.length} clerk_id=${rows[0]?.clerk_id === clerkUserId} verified=${rows[0]?.email_verified !== null}`);

    // 6. Sign out → back to guest state (Clerk clears the session cookie).
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    // The navbar renders guest state first and updates after its client-side
    // session fetch — wait for that fetch before judging the button.
    await page.waitForResponse(
      (r) => r.url().includes("/api/auth/session"),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(600);
    const menuBtn = page.locator("nav button").filter({ has: page.locator(".rounded-full") }).first();
    if (await menuBtn.count() > 0) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      const signOutBtn = page.getByText("Sign Out", { exact: true }).first();
      await signOutBtn.waitFor({ state: "visible", timeout: 10000 });
      await signOutBtn.click();
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
        `nav=${after.split(String.fromCharCode(10)).join(" | ").slice(0, 80)}`);
    } else {
      check("auth: sign out returns navbar to guest state", false, "user menu button not found");
    }
  } finally {
    await browser.close();
    if (clerkUserId) {
      try {
        await api(`/users/${clerkUserId}`, { method: "DELETE" });
        console.log("ℹ  clerk test user deleted");
      } catch {}
    }
    try {
      await sql`delete from users where email = ${email}`;
      console.log("ℹ  auth test row deleted");
    } catch (e) {
      console.warn(`⚠  cleanup failed for ${email}: ${e.message}`);
    }
  }
}

/**
 * Identity-storage phase — guards the Clerk→Postgres bridge.
 * Checks the users.clerk_id unique column exists and the webhook endpoint
 * rejects unsigned requests (signature verification live).
 */
async function runOAuthPhase() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    const cols = await sql`select column_name from information_schema.columns
      where table_name = 'users'`;
    const hasClerkId = cols.some((c) => c.column_name === "clerk_id");
    check("identity: users.clerk_id column exists", hasClerkId);
    if (hasClerkId) {
      const idx = await sql`select indexdef from pg_indexes
        where tablename = 'users' and indexdef ilike '%clerk_id%'`;
      check("identity: users.clerk_id is unique-indexed", idx.length > 0,
        idx.map((r) => r.indexdef).join(";").slice(0, 80));
    }
  } else {
    console.log("ℹ  skipping identity DB checks — DATABASE_URL unavailable");
  }
  const res = await fetch(`${BASE}/api/webhooks/clerk`, { method: "POST", body: "{}" });
  check("identity: clerk webhook rejects unsigned request",
    res.status === 401 || res.status === 500,
    `got ${res.status}`);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err.message);
  process.exit(1);
});
