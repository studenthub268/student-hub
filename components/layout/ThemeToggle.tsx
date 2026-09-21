"use client";

import { Moon, Sun } from "lucide-react";

// Storage key + class name shared with the no-flash inline script in
// app/layout.tsx — keep in sync.
export const THEME_STORAGE_KEY = "sh-theme";
const DARK_CLASS = "dark";

// Fully CSS-driven: no React state, no hydration dependency. The <html>
// class is the single source of truth; the two icons are both rendered and
// CSS shows the one matching the current mode via the `dark:` variant.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.classList.contains(DARK_CLASS) ? "light" : "dark";
    root.classList.toggle(DARK_CLASS, next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode: apply for the session only */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark theme"
      title="Toggle dark theme"
      className={`flex items-center justify-center h-10 w-10 rounded-xl border-2 border-ink bg-surface text-foreground hover:bg-accent hover:text-accent-contrast transition-all press shadow-hard-sm ${className}`}
    >
      {/* Light mode: sun (tap for dark). Dark mode: moon (tap for light). */}
      <Sun className="h-5 w-5 dark:hidden" strokeWidth={1.75} aria-hidden />
      <Moon className="hidden h-5 w-5 dark:block" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
