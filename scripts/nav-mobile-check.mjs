/* Verify: <md shows round search icon + hamburger (no search bar in menu);
   md–lg shows icon; ≥lg shows desktop pill only. */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:3117";

const launch = async () => {
  for (const opts of [{ channel: "chrome" }, { channel: "msedge" }, {}]) {
    try { return await chromium.launch({ headless: true, ...opts }); } catch {}
  }
  throw new Error("No Chrome/Edge/Chromium available");
};

const browser = await launch();
const results = [];

for (const [w, h, label] of [[390, 844, "mobile-390"], [915, 412, "md-lg-915"], [1280, 800, "lg-1280"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => {
    const visible = (el) => el && getComputedStyle(el).display !== "none" && el.offsetParent !== null;
    const icon = [...document.querySelectorAll("nav button")].find(b => b.getAttribute("aria-label") === "Search");
    const pill = document.querySelector("nav [role='search']");
    const burger = [...document.querySelectorAll("nav button")].find(b => b.getAttribute("aria-label") === "Toggle menu");
    return { icon: visible(icon), pill: visible(pill), burger: visible(burger) };
  });

  let menuResult = null;
  if (state.burger) {
    // Open the hamburger and check the menu contents
    await page.click("nav button[aria-label='Toggle menu']");
    await page.waitForTimeout(400);
    menuResult = await page.evaluate(() => {
      const menus = [...document.querySelectorAll("nav .md\\:hidden")];
      const menu = menus.find(m => m.querySelector("a")); // the dropdown with links
      return {
        menuOpen: !!menu,
        menuHasSearchBar: menu ? !!menu.querySelector("[role='search'], input") : null,
      };
    });
    await page.click("nav button[aria-label='Toggle menu']");
  }

  // Search icon must be the same SHAPE as the hamburger: rounded-xl square,
  // same size, same border width.
  let shapesMatch = null;
  if (state.icon && state.burger) {
    shapesMatch = await page.evaluate(() => {
      const q = (label) => [...document.querySelectorAll("nav button")].find(b => b.getAttribute("aria-label") === label);
      const s = getComputedStyle(q("Search")), b = getComputedStyle(q("Toggle menu"));
      return s.borderRadius === b.borderRadius && s.borderWidth === b.borderWidth
        && Math.abs(parseFloat(s.width) - parseFloat(b.width)) < 0.5
        && Math.abs(parseFloat(s.height) - parseFloat(b.height)) < 0.5;
    });
  }

  results.push({ label, ...state, menu: menuResult, shapesMatch });
  await page.close();
}

await browser.close();
let ok = true;
for (const r of results) {
  const expect = r.label === "lg-1280"
    ? { icon: false, pill: true, burger: false }
    : { icon: true, pill: false, burger: r.label === "mobile-390" };
  const pass = r.icon === expect.icon && r.pill === expect.pill && (r.menu?.menuHasSearchBar === false || r.menu === null)
    && (r.shapesMatch === null || r.shapesMatch === true);
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${r.label}: icon=${r.icon} pill=${r.pill} burger=${r.burger} menu=${JSON.stringify(r.menu)} shapesMatch=${r.shapesMatch}`);
}
process.exit(ok ? 0 : 1);
