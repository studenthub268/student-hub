/* Capture console errors from the live site while SIGNED IN is not possible
   headlessly, so this checks guest view on all key routes. */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "https://student-hub-uet.vercel.app";

const launch = async () => {
  for (const opts of [{ channel: "chrome" }, { channel: "msedge" }, {}]) {
    try {
      return await chromium.launch({ headless: true, ...opts });
    } catch {
      // try next browser channel
    }
  }
  throw new Error("No Chrome/Edge/Chromium available");
};

const browser = await launch();
const page = await browser.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    errors.push(`[console.error] ${msg.text().slice(0, 300)}`);
  }
});
page.on("pageerror", (err) => {
  errors.push(`[pageerror] ${err.message.slice(0, 300)}`);
});
page.on("response", (res) => {
  if (res.status() >= 400) {
    errors.push(`[http ${res.status()}] ${res.url().slice(0, 160)}`);
  }
});

for (const route of ["/", "/browse", "/find", "/login", "/contact", "/terms"]) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => {
    errors.push(`[nav] ${route}: ${e.message.slice(0, 120)}`);
  });
  await page.waitForTimeout(1200);
}

console.log("=== ERRORS (deduped) ===");
const unique = [...new Set(errors)];
if (unique.length === 0) console.log("(none)");
for (const e of unique) console.log(e);

await browser.close();
