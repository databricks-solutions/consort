"use client";

// Theme toggle state for the in-app ☀️/🌙 button. Color switching itself is pure CSS — the
// two token blocks in lib/theme.ts hang off `data-theme` on <html> — so this hook only flips
// that attribute, persists the choice to localStorage, and tracks the value for the glyph.
//
// The actual initial theme is applied before paint by the no-flash script in layout.tsx
// (query > localStorage > env default). Here we read it back on mount, so the button matches
// whatever the page booted with. `theme` is null until mounted to avoid a hydration mismatch
// on the glyph (the server can't know the viewer's localStorage).

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = (prev ?? "light") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch {
        // private mode / storage disabled — the flip still applies for this session.
      }
      return next;
    });
  };

  return { theme, toggle };
}
