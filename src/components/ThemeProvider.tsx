"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type ThemeMode = "white" | "gray" | "black";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "theme-mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("white");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (stored && ["white", "gray", "black"].includes(stored)) {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  // Apply theme class to html element whenever theme changes
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove("dark", "gray-mode");
    
    // Apply the current theme class
    if (theme === "black") {
      root.classList.add("dark");
    } else if (theme === "gray") {
      root.classList.add("gray-mode");
    }
    // "white" theme = default, no class needed
    
    // Persist to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, mounted]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  // ALWAYS provide context - even before mount - this prevents "useTheme must be used within ThemeProvider" error
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  // Return default values instead of throwing if not mounted yet
  if (context === undefined) {
    // Return a default theme instead of throwing - safe for SSR/hydration
    return { theme: "white" as ThemeMode, setTheme: () => {} };
  }
  return context;
}
