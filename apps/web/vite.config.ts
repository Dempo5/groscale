// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,           // allow LAN/dev containers
    port: 5173,
  },
  preview: {
    host: true,           // required when running `vite preview` on Render
    port: 4173,
    // 👇 allow your Render hostname
    allowedHosts: ["groscale-frontend.onrender.com"],
  },
});
