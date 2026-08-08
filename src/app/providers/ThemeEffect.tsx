import { useEffect } from "react";

import { useSettings } from "@/app/providers/SettingsProvider";

/** Applies the light/dark/system appearance preference to the document. */
export function ThemeEffect() {
  const { settings } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = settings.appearance === "dark" || (settings.appearance === "system" && media.matches);
      root.classList.toggle("dark", dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#0d0f12" : "#faf9f7");
    };

    apply();
    if (settings.appearance !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.appearance]);

  return null;
}
