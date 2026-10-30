// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { resumePdf } from "./src/integrations/resume-pdf";

// https://astro.build/config
export default defineConfig({
  site: "https://danielmcgrath.xyz",
  // Netlify serves each page as a directory index and redirects /page to /page/
  trailingSlash: "always",
  integrations: [react(), sitemap(), resumePdf()],
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Geist",
      styles: ["normal"],
      cssVariable: "--font-geist",
      weights: ["300 700"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Geist Mono",
      styles: ["normal"],
      cssVariable: "--font-geist-mono",
      weights: ["400 500"],
      fallbacks: ["monospace"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Instrument Serif",
      styles: ["normal", "italic"],
      cssVariable: "--font-instrument-serif",
      fallbacks: ["serif"],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
