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

/** Injected at runtime so contrast rules always apply (bypass CSS build quirks). */
const CONTRAST_LAW_CSS = `
/* Black / dark solid box → WHITE writing (self + children) */
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
/* Light solid box → BLACK writing (self + children) */
.bg-white,.bg-white *,
.bg-gray-50,.bg-gray-50 *,.bg-gray-100,.bg-gray-100 *,
.bg-slate-50,.bg-slate-50 *,.bg-slate-100,.bg-slate-100 *,
.bg-zinc-50,.bg-zinc-50 *,.bg-neutral-50,.bg-neutral-50 *,.bg-stone-50,.bg-stone-50 *,
.bg-sky-50,.bg-sky-50 *,.bg-blue-50,.bg-blue-50 *,.bg-violet-50,.bg-violet-50 *,
.bg-purple-50,.bg-purple-50 *,.bg-indigo-50,.bg-indigo-50 *,
.bg-amber-50,.bg-amber-50 *,.bg-yellow-50,.bg-yellow-50 *,.bg-orange-50,.bg-orange-50 *,
.bg-emerald-50,.bg-emerald-50 *,.bg-green-50,.bg-green-50 *,.bg-teal-50,.bg-teal-50 *,
.bg-cyan-50,.bg-cyan-50 *,.bg-rose-50,.bg-rose-50 *,.bg-red-50,.bg-red-50 *,.bg-pink-50,.bg-pink-50 *,
[data-ink-on-light],[data-ink-on-light] *{
  color:#0f172a !important;
  -webkit-text-fill-color:#0f172a !important;
}
/* Dark buttons inside light panels stay WHITE (must come after light rule) */
.bg-white .bg-black,.bg-white .bg-black *,
.bg-white .bg-slate-900,.bg-white .bg-slate-900 *,
.bg-white .bg-slate-800,.bg-white .bg-slate-800 *,
.bg-white .bg-gray-900,.bg-white .bg-gray-900 *,
.bg-white .bg-blue-600,.bg-white .bg-blue-600 *,
.bg-white .bg-blue-700,.bg-white .bg-blue-700 *,
.bg-white .bg-emerald-600,.bg-white .bg-emerald-600 *,
.bg-white .bg-emerald-700,.bg-white .bg-emerald-700 *,
.bg-white .bg-indigo-600,.bg-white .bg-indigo-600 *,
.bg-white .bg-violet-600,.bg-white .bg-violet-600 *,
.bg-white .bg-primary,.bg-white .bg-primary *,
.bg-amber-50 .bg-slate-900,.bg-amber-50 .bg-slate-900 *,
.bg-amber-50 .bg-slate-800,.bg-amber-50 .bg-slate-800 *,
.bg-amber-50 .bg-blue-600,.bg-amber-50 .bg-blue-600 *,
.bg-amber-50 .bg-emerald-700,.bg-amber-50 .bg-emerald-700 *,
[data-ink-on-light] .bg-black,[data-ink-on-light] .bg-black *,
[data-ink-on-light] .bg-slate-900,[data-ink-on-light] .bg-slate-900 *,
[data-ink-on-light] .bg-slate-800,[data-ink-on-light] .bg-slate-800 *,
[data-ink-on-light] .bg-gray-900,[data-ink-on-light] .bg-gray-900 *,
[data-ink-on-light] .bg-blue-600,[data-ink-on-light] .bg-blue-600 *,
[data-ink-on-light] .bg-blue-700,[data-ink-on-light] .bg-blue-700 *,
[data-ink-on-light] .bg-emerald-600,[data-ink-on-light] .bg-emerald-600 *,
[data-ink-on-light] .bg-emerald-700,[data-ink-on-light] .bg-emerald-700 *,
[data-ink-on-light] .bg-indigo-600,[data-ink-on-light] .bg-indigo-600 *,
[data-ink-on-light] .bg-violet-600,[data-ink-on-light] .bg-violet-600 *,
[data-ink-on-light] .bg-primary,[data-ink-on-light] .bg-primary *,
[data-ink-on-light] [data-ink-keep],[data-ink-on-light] [data-ink-keep] *{
  color:#ffffff !important;
  -webkit-text-fill-color:#ffffff !important;
}
/* Blue links on light panels */
.bg-white a,.bg-white .text-blue-600,.bg-white .text-blue-700,
[data-ink-on-light] a:not([data-ink-keep]),[data-ink-on-light] .text-blue-600{
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

  // Inject contrast law into document head (always last, always present)
  useEffect(() => {
    const id = "trio-contrast-law";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = CONTRAST_LAW_CSS;
  }, []);

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
