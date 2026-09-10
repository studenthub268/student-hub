/* Signed-in navbar measurement at iPad widths: mock /api/auth/session +
   /api/check-admin + /api/admin/message-count, then measure whether the
   nav pill contents overflow or the wordmark wraps. */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:3127";

const launch = async () => {
  for (const opts of [{ channel: "chrome" }, { channel: "msedge" }, {}]) {
    try { return await chromium.launch({ headless: true, ...opts }); } catch {}
  }
  throw new Error("No Chrome/Edge available");
};

const browser = await launch();
let ok = true;

for (const [w, h, label] of [[1024, 768, "ipad-mini-landscape-1024"], [820, 1180, "ipad-air-portrait-820"], [768, 1024, "ipad-mini-portrait-768"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route("**/api/auth/session", r => r.fulfill({ json: { user: { id: "u1", name: "Abubakar Tanveer", email: "abubakar.tanveer@example.com", image: null } } }));
  await page.route("**/api/check-admin", r => r.fulfill({ json: { admin: true } }));
  await page.route("**/api/admin/message-count", r => r.fulfill({ json: { count: 3 } }));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const nav = document.querySelector("nav > div > div");
    const nr = nav.getBoundingClientRect();
    const visible = el => el && el.getBoundingClientRect().width > 0;
    const wordmark = [...document.querySelectorAll("nav a span")].find(s => s.textContent === "Student Hub");
    const wr = wordmark?.getBoundingClientRect();
    const pill = document.querySelector("nav [role='search']");
    const authBtn = [...document.querySelectorAll("nav button")].find(b => b.textContent.includes("Abubakar"));
    const admin = [...document.querySelectorAll("nav a")].find(a => a.textContent.trim().startsWith("Admin"));
    const authR = authBtn?.getBoundingClientRect();
    return {
      wordmarkWrapped: wr ? wr.height > 40 : null,
      pillVisible: visible(pill), pillW: pill ? Math.round(pill.getBoundingClientRect().width) : 0,
      authVisible: !!authR && authR.width > 0, authW: authR ? Math.round(authR.width) : 0,
      adminVisible: visible(admin),
      // does the auth chip stick out of the nav pill (clipped by rounded corner)?
      authSticksOut: authR ? authR.right > nr.right + 1 || authR.bottom > nr.bottom + 1 : null,
      // any visible child overflowing the pill horizontally?
      overflowers: [...nav.querySelectorAll("*")].filter(el => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && (b.right > nr.right + 1 || b.left < nr.left - 1);
      }).map(el => (el.className || "").toString().slice(0, 40)).slice(0, 5),
      // smallest gap between left logo block and middle links (the squeeze signal)
      gapLogoLinks: (() => {
        const logo = document.querySelector("nav a span");
        const links = [...document.querySelectorAll("nav a")].filter(a => ["Home","Browse","Upload","Contact"].includes(a.textContent.trim()) && visible(a));
        if (!links.length) return null;
        return Math.round(Math.min(...links.map(l => l.getBoundingClientRect().left)) - logo.getBoundingClientRect().right);
      })(),
    };
  });
  const pass = !r.wordmarkWrapped && !r.authSticksOut && r.overflowers.length === 0;
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(r)}`);
  await page.screenshot({ path: `scripts/ipad-signedin-${label}.png`, clip: { x: 0, y: 0, width: w, height: 220 } });
  await page.close();
}
await browser.close();
process.exit(ok ? 0 : 1);
