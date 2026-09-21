"use client";

import { Moon, Sun } from "lucide-react";

// Storage key + class name shared with the no-flash inline script in
// app/layout.tsx — keep in sync.
export const THEME_STORAGE_KEY = "sh-theme";
const DARK_CLASS = "dark";

// Lives in the profile dropdown (desktop) and the mobile menu. Fully
// CSS-driven: no React state, no hydration dependency. The <html> class is
// the single source of truth; both icons render and CSS shows the one
// matching the current mode via the `dark:` variant.
export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
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
      className={
        mobile
          ? "flex w-full items-center gap-3 px-6 py-4 text-base font-bold text-foreground hover:bg-accent hover:text-accent-contrast transition-colors"
          : "flex w-full items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors"
      }
    >
      {/* Current mode: sun in light, moon in dark. */}
      <Sun className="h-4 w-4 dark:hidden" strokeWidth={1.75} aria-hidden />
      <Moon className="hidden h-4 w-4 dark:block" strokeWidth={1.75} aria-hidden />
      Theme
      <span className="ml-auto text-xs font-bold opacity-60">
        <span className="dark:hidden">Light</span>
        <span className="hidden dark:inline">Dark</span>
      </span>
    </button>
  );
}
