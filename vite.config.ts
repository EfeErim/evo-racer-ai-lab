import { defineConfig, type ProxyOptions } from "vite";

// The dev UI calls the Python service through this proxy, so the browser sees one
// origin as in the packaged app. The service only accepts its own origin, so the
// proxy drops the dev page's Origin header.
const localService: ProxyOptions = {
  target: "http://127.0.0.1:8765",
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on("proxyReq", (request) => {
      request.removeHeader("origin");
    });
  },
};

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/v1": localService,
      "/health": localService,
    },
  },
});
