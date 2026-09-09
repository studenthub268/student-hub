/* Screenshot the navbar at landscape viewports for visual verification. */
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

for (const [w, h, label] of [
  [915, 412, "android-landscape"],
  [1024, 768, "ipad-landscape"],
  [1280, 800, "laptop"],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const nav = await page.$("nav");
  if (nav) {
    await nav.screenshot({ path: `scripts/nav-${label}-${w}.png` });
    console.log(`saved scripts/nav-${label}-${w}.png`);
  }
  await page.close();
}

await browser.close();
