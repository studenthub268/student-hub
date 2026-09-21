// One-shot codemod: maps the site's hardcoded light-theme utility classes to
// the theme token classes defined in app/globals.css. Idempotent — class
// names AFTER mapping are never inputs to any other rule, so re-running is a
// no-op. Usage: node scripts/theme-map.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Longest-first so "/95" variants match before bare "bg-white" etc.
const CLASS_MAP = [
  // ---- Surfaces ----
  ["bg-white/95", "bg-surface/95"],
  ["bg-white/70", "bg-surface/70"],
  ["bg-white/40", "bg-surface/40"],
  ["bg-white/20", "bg-surface/20"],
  ["bg-white/15", "bg-surface/15"],
  ["bg-white/10", "bg-surface/10"],
  ["bg-white/5", "bg-surface/5"],
  ["bg-white", "bg-surface"],
  ["bg-[#f8fafc]", "bg-surface-muted"],
  ["bg-gray-50", "bg-surface-muted"],
  ["bg-gray-100", "bg-surface-muted"],
  ["bg-gray-200", "bg-surface-muted"],
  ["bg-gray-800", "bg-ink"],
  ["bg-neutral-800/40", "bg-ink-muted/40"],

  // ---- Borders ----
  ["border-white/40", "border-foreground/40"],
  ["border-white/25", "border-foreground/25"],
  ["border-white/20", "border-foreground/20"],
  ["border-black/40", "border-line-strong"],
  ["border-black/30", "border-line-strong"],
  ["border-black/20", "border-line"],
  ["border-black/10", "border-line"],
  ["border-black/5", "border-line"],
  ["border-black", "border-ink"],
  ["border-[#111]", "border-ink"],
  ["border-gray-200", "border-line"],
  ["border-gray-300", "border-line"],

  // ---- Text ----
  ["text-white/90", "text-background/90"],
  ["text-white/85", "text-background/85"],
  ["text-white/80", "text-background/80"],
  ["text-white/70", "text-background/70"],
  ["text-white/60", "text-background/60"],
  ["text-white", "text-background"],
  ["text-black/80", "text-foreground/80"],
  ["text-black/70", "text-foreground/70"],
  ["text-black/60", "text-foreground/60"],
  ["text-black/50", "text-foreground/60"],
  ["text-black/40", "text-foreground/50"],
  ["text-black/30", "text-foreground/50"],
  ["text-black/20", "text-foreground/40"],
  ["text-black/10", "text-foreground/30"],
  ["text-black", "text-foreground"],
  ["text-[#111]", "text-foreground"],
  ["text-gray-900", "text-foreground"],
  ["text-gray-800", "text-foreground"],
  ["text-gray-700", "text-foreground"],
  ["text-gray-600", "text-foreground/70"],
  ["text-gray-500", "text-foreground/60"],
  ["text-gray-400", "text-foreground/50"],
  ["text-gray-300", "text-foreground/40"],

  // ---- Placeholders ----
  ["placeholder:text-black/60", "placeholder:text-foreground/50"],
  ["placeholder:text-black/40", "placeholder:text-foreground/50"],
  ["placeholder:text-black/30", "placeholder:text-foreground/40"],
  ["placeholder:text-black/20", "placeholder:text-foreground/40"],
  ["placeholder:text-gray-400", "placeholder:text-foreground/40"],
  ["placeholder:text-gray-500", "placeholder:text-foreground/40"],

  // ---- Fills / decorative ----
  ["fill-white", "fill-background"],
  ["fill-black", "fill-foreground"],
  ["decoration-black/30", "decoration-foreground/30"],
  ["decoration-black", "decoration-foreground"],

  // ---- Hover variants (after base classes — order matters) ----
  ["hover:bg-white", "hover:bg-surface"],
  ["hover:bg-black/80", "hover:bg-ink/80"],
  ["hover:bg-black/70", "hover:bg-ink/70"],
  ["hover:bg-black", "hover:bg-ink"],
  ["hover:bg-gray-50", "hover:bg-surface-muted"],
  ["hover:bg-gray-100", "hover:bg-surface-muted"],
  ["hover:text-white", "hover:text-background"],
  ["hover:text-black/60", "hover:text-foreground/60"],
  ["hover:text-black", "hover:text-foreground"],
  ["hover:border-black/30", "hover:border-line-strong"],
  ["hover:border-black", "hover:border-ink"],
  ["group-hover:text-white", "group-hover:text-background"],
  ["group-hover:text-black/60", "group-hover:text-foreground/60"],
  ["group-hover:text-black", "group-hover:text-foreground"],
  ["group-hover:bg-white", "group-hover:bg-surface"],
  ["group-hover:bg-black", "group-hover:bg-ink"],
  ["selection:text-black", "selection:text-background"],
];

// Arbitrary hard shadows -> semantic token shadow utilities (globals.css).
const SHADOW_MAP = [
  ["shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]", "shadow-hard-xl"],
  ["shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]", "shadow-hard-lg"],
  ["shadow-[8px_8px_0px_0px_rgba(17,17,17,1)]", "shadow-hard-lg"],
  ["shadow-[8px_8px_0px_0px_#111]", "shadow-hard-lg"],
  ["shadow-[6px_6px_0px_0px_#111]", "shadow-hard-lg"],
  ["shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]", "shadow-hard"],
  ["shadow-[4px_4px_0px_0px_rgba(17,17,17,1)]", "shadow-hard"],
  ["shadow-[4px_4px_0px_0px_#111]", "shadow-hard"],
  ["shadow-[4px_4px_0px_rgba(0,0,0,1)]", "shadow-hard"],
  ["shadow-[3px_3px_0px_0px_#0D9488]", "shadow-hard-accent-sm"],
  ["shadow-[2px_2px_0px_0px_#0D9488]", "shadow-hard-accent-sm"],
  ["shadow-[4px_4px_0px_0px_#0D9488]", "shadow-hard-accent"],
  ["shadow-[8px_8px_0px_0px_#0D9488]", "shadow-hard-accent-lg"],
  ["shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]", "shadow-hard-sm"],
  ["shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]", "shadow-hard-dim"],
  ["shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]", "shadow-hard-faint"],
  ["shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]", "shadow-hard-faint"],
  ["shadow-[4px_4px_0px_0px_#fff]", "shadow-hard-invert"],
];

const files = execSync('git ls-files "app/**/*.tsx" "app/**/*.ts" "components/**/*.tsx" "lib/**/*.ts" "types/**/*.ts"', {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

let touched = 0;
const report = [];
for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [from, to] of [...CLASS_MAP, ...SHADOW_MAP]) {
    // \b-style guard: don't match inside a longer class (e.g. bg-white must
    // not hit bg-white/70 — longest-first ordering above handles the other
    // direction). Lookbehind/ahead on the class-name charset.
    const pattern = new RegExp(
      `(?<![\\w[\\]#/.-])${from.replace(/[/\\]/g, "\\$&").replace(/[-[\]{}()*+?.,^$|]/g, "\\$&")}(?![\\w[\\]/.-])`,
      "g",
    );
    after = after.replace(pattern, to);
  }
  if (after !== before) {
    writeFileSync(file, after);
    touched++;
    report.push(file);
  }
}
console.log(`Rewrote ${touched} files:\n${report.join("\n")}`);
