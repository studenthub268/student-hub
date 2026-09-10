/* Signed-in layout audit: mocks /api/auth/session + admin endpoints, visits
   every page at mobile + iPad widths, and reports:
   - horizontal document overflow
   - elements sticking out of the viewport
   - nav-pill contents overflowing the pill (the iPad squeeze bug class)
   Resource detail is reached by clicking the first card on /browse. */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:3127";
const PAGES = ["/", "/browse", "/upload", "/profile", "/contact", "/terms", "/login", "/admin", "RESOURCE"];

const launch = async () => {
  for (const opts of [{ channel: "chrome" }, { channel: "msedge" }, {}]) {
    try { return await chromium.launch({ headless: true, ...opts }); } catch {}
  }
  throw new Error("No Chrome/Edge available");
};

const browser = await launch();
const failures = [];

async function audit(page, label) {
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const issues = [];
    if (document.documentElement.scrollWidth > vw + 1) {
      issues.push(`doc-overflow +${document.documentElement.scrollWidth - vw}px`);
    }
    // elements extending past the viewport (exclude decorative offscreen: width 0)
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
      if (b.right > vw + 8 || b.left < -8) {
        issues.push(`offscreen <${el.tagName.toLowerCase()} class="${(el.className || "").toString().slice(0, 50)}"> r=${Math.round(b.right)} l=${Math.round(b.left)}`);
        if (issues.length > 4) break;
      }
    }
    // nav pill internals
    const nav = document.querySelector("nav > div > div");
    if (nav) {
      const nr = nav.getBoundingClientRect();
      const wordmark = [...nav.querySelectorAll("a span")].find(s => s.textContent === "Student Hub");
      if (wordmark && wordmark.getBoundingClientRect().height > 40) issues.push("wordmark-wrapped");
      for (const el of nav.querySelectorAll("*")) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (b.right > nr.right + 1 || b.left < nr.left - 1) {
          issues.push(`nav-overflow <${el.tagName.toLowerCase()} class="${(el.className || "").toString().slice(0, 40)}">`);
          if (issues.length > 6) break;
        }
      }
    }
    return { vw, issues };
  });
  const status = r.issues.length ? "FAIL" : "PASS";
  if (r.issues.length) failures.push(`${label}: ${r.issues.join(" | ")}`);
  console.log(`${status} ${label}${r.issues.length ? " -> " + r.issues.join(" | ") : ""}`);
}

for (const [w, h, tag] of [[390, 844, "m390"], [768, 1024, "ipad768"], [820, 1180, "ipad820"], [1024, 768, "ipad1024"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route("**/api/auth/session", r => r.fulfill({ json: { user: { id: "u1", name: "Abubakar Tanveer", email: "abubakar.tanveer@example.com", image: null } } }));
  await page.route("**/api/check-admin", r => r.fulfill({ json: { admin: true } }));
  await page.route("**/api/admin/message-count", r => r.fulfill({ json: { count: 3 } }));
  for (const target of PAGES) {
    try {
      if (target === "RESOURCE") {
        await page.goto(BASE + "/browse", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const card = page.locator("a[href^='/resource/']").first();
        if (await card.count() === 0) { console.log(`SKIP ${tag} resource-detail (no cards)`); continue; }
        await card.click();
        await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
      } else {
        await page.goto(BASE + target, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
      }
      await audit(page, `${tag} ${target === "RESOURCE" ? "/resource/[id]" : target}`);
    } catch (e) {
      console.log(`ERR  ${tag} ${target}: ${e.message.slice(0, 80)}`);
      failures.push(`${tag} ${target} errored`);
    }
  }
  await page.close();
}
await browser.close();
console.log(failures.length ? `\n${failures.length} ISSUE(S)` : "\nALL CLEAN");
process.exit(failures.length ? 1 : 0);
