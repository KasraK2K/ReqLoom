import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const envDir = path.resolve(dirname, "..");
const frontendHost = "127.0.0.1";
const frontendPort = 3030;

function resolveBackendPort(mode: string, env: Record<string, string>) {
  const configuredPort = env.BACKEND_PORT || env.PORT;

  if (mode !== "production" && !env.BACKEND_PORT && configuredPort === "4000") {
    return "3500";
  }

  return configuredPort || "3500";
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const backendPort = resolveBackendPort(mode, env);
  const backendTarget = env.BACKEND_TARGET || `http://127.0.0.1:${backendPort}`;

  return {
    envDir,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "./src"),
        "@restify/shared": path.resolve(dirname, "../shared/src/index.ts"),
      },
    },
    server: {
      host: frontendHost,
      port: frontendPort,
      strictPort: false,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    preview: {
      host: frontendHost,
      port: 3031,
      strictPort: false,
    },
  };
});
