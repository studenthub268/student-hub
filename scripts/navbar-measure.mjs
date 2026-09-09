/* Check navbar pill overflow at mid-size viewports. */
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

for (const [w, h] of [[1024, 768], [1150, 800], [1279, 800]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const pill = document.querySelector("nav .border-2");
    const input = document.querySelector('input[placeholder*="Search resources"]');
    if (!pill || !input) return { found: false };
    const pr = pill.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const inner = pill.firstElementChild?.getBoundingClientRect();
    return {
      pillRight: Math.round(pr.right),
      searchRight: Math.round(ir.right),
      overflowsPill: ir.right > pr.right + 1,
      scrollWidthVsClient: `${pill.scrollWidth}/${pill.clientWidth}`,
      innerWidth: inner ? Math.round(inner.width) : 0,
    };
  });

  console.log(`${w}px:`, JSON.stringify(info));
  await page.close();
}

await browser.close();
