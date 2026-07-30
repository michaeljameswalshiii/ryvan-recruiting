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
