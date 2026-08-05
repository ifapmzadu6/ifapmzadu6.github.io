import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ifapmzadu6.github.io",
  output: "static",
  build: {
    format: "preserve",
    inlineStylesheets: "never",
  },
});
