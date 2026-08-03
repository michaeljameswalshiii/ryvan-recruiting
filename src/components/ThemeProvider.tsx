"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** App-wide UI theme. "black" = near-black slate dark mode. */
export type ThemeMode = "white" | "gray" | "black";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  /** Convenience: true when dark (black) mode is active */
  isDark: boolean;
  toggleLightDark: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "theme-mode";

function normalizeTheme(raw: string | null): ThemeMode | null {
  if (!raw) return null;
  // Migrate Agent Desk-only keys
  if (raw === "dark") return "black";
  if (raw === "light") return "white";
  if (raw === "white" || raw === "gray" || raw === "black") return raw;
  return null;
}

/**
 * Injected into document.head (always last).
 * Dark mode only for light-panel black text — light mode uses normal Tailwind.
 * Black/dark boxes → white text in BOTH themes.
 */
const CONTRAST_LAW_CSS = `
/* ===== BLACK / DARK BOX → WHITE TEXT (always) ===== */
.bg-black,.bg-black *,
.bg-slate-950,.bg-slate-950 *,.bg-slate-900,.bg-slate-900 *,.bg-slate-800,.bg-slate-800 *,
.bg-gray-950,.bg-gray-950 *,.bg-gray-900,.bg-gray-900 *,.bg-gray-800,.bg-gray-800 *,
.bg-zinc-950,.bg-zinc-950 *,.bg-zinc-900,.bg-zinc-900 *,.bg-zinc-800,.bg-zinc-800 *,
.bg-neutral-900,.bg-neutral-900 *,.bg-neutral-800,.bg-neutral-800 *,
.bg-stone-900,.bg-stone-900 *,
.bg-blue-600,.bg-blue-600 *,.bg-blue-700,.bg-blue-700 *,.bg-blue-800,.bg-blue-800 *,.bg-blue-900,.bg-blue-900 *,
.bg-indigo-600,.bg-indigo-600 *,.bg-indigo-700,.bg-indigo-700 *,
.bg-violet-600,.bg-violet-600 *,.bg-violet-700,.bg-violet-700 *,
.bg-emerald-600,.bg-emerald-600 *,.bg-emerald-700,.bg-emerald-700 *,.bg-emerald-800,.bg-emerald-800 *,
.bg-rose-600,.bg-rose-600 *,.bg-rose-700,.bg-rose-700 *,
.bg-red-600,.bg-red-600 *,.bg-red-700,.bg-red-700 *,
.bg-primary,.bg-primary *,
[data-ink-keep],[data-ink-keep] *{
  color:#ffffff !important;
  -webkit-text-fill-color:#ffffff !important;
}

/* ===== DARK MODE ONLY: light box → BLACK text ===== */
html.dark .bg-white,html.dark .bg-white *,
html.dark .bg-gray-50,html.dark .bg-gray-50 *,
html.dark .bg-gray-100,html.dark .bg-gray-100 *,
html.dark .bg-slate-50,html.dark .bg-slate-50 *,
html.dark .bg-slate-100,html.dark .bg-slate-100 *,
html.dark .bg-zinc-50,html.dark .bg-zinc-50 *,
html.dark .bg-neutral-50,html.dark .bg-neutral-50 *,
html.dark .bg-stone-50,html.dark .bg-stone-50 *,
html.dark .bg-sky-50,html.dark .bg-sky-50 *,
html.dark .bg-blue-50,html.dark .bg-blue-50 *,
html.dark .bg-violet-50,html.dark .bg-violet-50 *,
html.dark .bg-purple-50,html.dark .bg-purple-50 *,
html.dark .bg-indigo-50,html.dark .bg-indigo-50 *,
html.dark .bg-amber-50,html.dark .bg-amber-50 *,
html.dark .bg-yellow-50,html.dark .bg-yellow-50 *,
html.dark .bg-orange-50,html.dark .bg-orange-50 *,
html.dark .bg-emerald-50,html.dark .bg-emerald-50 *,
html.dark .bg-green-50,html.dark .bg-green-50 *,
html.dark .bg-teal-50,html.dark .bg-teal-50 *,
html.dark .bg-cyan-50,html.dark .bg-cyan-50 *,
html.dark .bg-rose-50,html.dark .bg-rose-50 *,
html.dark .bg-red-50,html.dark .bg-red-50 *,
html.dark .bg-pink-50,html.dark .bg-pink-50 *,
html.dark [data-ink-on-light],html.dark [data-ink-on-light] *{
  color:#0f172a !important;
  -webkit-text-fill-color:#0f172a !important;
}

/* Dark buttons inside light panels: WHITE (after light rule) */
html.dark .bg-white .bg-slate-900,html.dark .bg-white .bg-slate-900 *,
html.dark .bg-white .bg-slate-800,html.dark .bg-white .bg-slate-800 *,
html.dark .bg-white .bg-gray-900,html.dark .bg-white .bg-gray-900 *,
html.dark .bg-white .bg-black,html.dark .bg-white .bg-black *,
html.dark .bg-white .bg-blue-600,html.dark .bg-white .bg-blue-600 *,
html.dark .bg-white .bg-blue-700,html.dark .bg-white .bg-blue-700 *,
html.dark .bg-white .bg-emerald-600,html.dark .bg-white .bg-emerald-600 *,
html.dark .bg-white .bg-emerald-700,html.dark .bg-white .bg-emerald-700 *,
html.dark .bg-white .bg-indigo-600,html.dark .bg-white .bg-indigo-600 *,
html.dark .bg-white .bg-violet-600,html.dark .bg-white .bg-violet-600 *,
html.dark .bg-white .bg-primary,html.dark .bg-white .bg-primary *,
html.dark .bg-amber-50 .bg-slate-900,html.dark .bg-amber-50 .bg-slate-900 *,
html.dark .bg-amber-50 .bg-slate-800,html.dark .bg-amber-50 .bg-slate-800 *,
html.dark .bg-amber-50 .bg-blue-600,html.dark .bg-amber-50 .bg-blue-600 *,
html.dark .bg-amber-50 .bg-emerald-700,html.dark .bg-amber-50 .bg-emerald-700 *,
html.dark [data-ink-on-light] .bg-slate-900,html.dark [data-ink-on-light] .bg-slate-900 *,
html.dark [data-ink-on-light] .bg-slate-800,html.dark [data-ink-on-light] .bg-slate-800 *,
html.dark [data-ink-on-light] .bg-blue-600,html.dark [data-ink-on-light] .bg-blue-600 *,
html.dark [data-ink-on-light] .bg-blue-700,html.dark [data-ink-on-light] .bg-blue-700 *,
html.dark [data-ink-on-light] .bg-emerald-700,html.dark [data-ink-on-light] .bg-emerald-700 *,
html.dark [data-ink-on-light] [data-ink-keep],html.dark [data-ink-on-light] [data-ink-keep] *{
  color:#ffffff !important;
  -webkit-text-fill-color:#ffffff !important;
}

/* Blue links on light cards in dark mode */
html.dark .bg-white a,html.dark .bg-white .text-blue-600,html.dark .bg-white .text-blue-700,
html.dark [data-ink-on-light] a,html.dark [data-ink-on-light] .text-blue-600{
  color:#2563eb !important;
  -webkit-text-fill-color:#2563eb !important;
}
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("white");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const fromApp = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
    const fromAgent = normalizeTheme(
      localStorage.getItem("trio-agent-desk-theme-v1")
    );
    if (fromApp) setThemeState(fromApp);
    else if (fromAgent) setThemeState(fromAgent);
    setMounted(true);
  }, []);

  // Inject contrast law into document head LAST (after any CSS from the build)
  useEffect(() => {
    const id = "trio-contrast-law";
    const ensure = () => {
      let el = document.getElementById(id) as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement("style");
        el.id = id;
        document.head.appendChild(el);
      }
      // Move to end of head so we win the cascade
      document.head.appendChild(el);
      el.textContent = CONTRAST_LAW_CSS;
    };
    ensure();
    // Re-assert after theme paint / late stylesheets
    const t = window.setTimeout(ensure, 0);
    return () => window.clearTimeout(t);
  }, [theme]);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove("dark", "gray-mode");

    if (theme === "black") {
      root.classList.add("dark");
    } else if (theme === "gray") {
      root.classList.add("gray-mode");
    }

    localStorage.setItem(THEME_STORAGE_KEY, theme);
    // Keep Agent Desk in sync if it still reads this key
    try {
      localStorage.setItem(
        "trio-agent-desk-theme-v1",
        theme === "black" ? "dark" : "light"
      );
    } catch {
      /* ignore */
    }
  }, [theme, mounted]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const toggleLightDark = () => {
    setThemeState((prev) => (prev === "black" ? "white" : "black"));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        isDark: theme === "black",
        toggleLightDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    return {
      theme: "white" as ThemeMode,
      setTheme: () => {},
      isDark: false,
      toggleLightDark: () => {},
    };
  }
  return context;
}
