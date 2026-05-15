import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/players":         { target: "http://localhost:3000", changeOrigin: true },
      "/zones":           { target: "http://localhost:3000", changeOrigin: true },
      "/items":           { target: "http://localhost:3000", changeOrigin: true },
      "/guilds":          { target: "http://localhost:3000", changeOrigin: true },
      "/quests":          { target: "http://localhost:3000", changeOrigin: true },
      "/inventory_slots": { target: "http://localhost:3000", changeOrigin: true },
      "/health":          { target: "http://localhost:3000", changeOrigin: true },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  // WebGPU requires cross-origin isolation — needed when Shallot is wired in
  plugins: [
    {
      name: "cross-origin-isolation",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      },
    },
  ],
});
