import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project Pages URL: https://<user>.github.io/HU-Shopping-Cart-Helper-Fall-2026/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/HU-Shopping-Cart-Helper-Fall-2026/" : "/",
}));
