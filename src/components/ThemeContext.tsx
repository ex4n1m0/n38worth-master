"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "blue" | "green" | "orange";

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "blue",
  setTheme: () => {},
});

export function useThemeColor() {
  return useContext(ThemeContext);
}

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.add("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("blue");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("app-theme") as ThemeName | null;
    if (stored === "green" || stored === "blue" || stored === "orange") {
      setThemeState(stored);
      applyTheme(stored);
    } else {
      applyTheme("blue");
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem("app-theme", newTheme);
    applyTheme(newTheme);
  };

  // Set initial data-theme via SSR-safe approach
  if (!mounted) {
    return (
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
