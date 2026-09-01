// ============= Full file contents =============
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import type { Plugin, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import { promises as fs } from "node:fs";
import path from "node:path";

// Load server-side env vars (no VITE_ prefix) into process.env so server
// routes can read SUPABASE_SERVICE_ROLE_KEY and similar.
const serverEnv = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, serverEnv);


// Dev-only fix for "Invalid server function ID" 500s.
//
// TanStack Start's server-fn plugin only registers a fn's ID when the *server
// environment* transforms the module that defines it. If the SSR runtime lazy-
// loads that module (which it does — server fns are resolved on demand via
// `getServerFnById`) and the module hasn't been transformed yet, the very
// first call throws. HMR makes this worse: after a restart the manifest is
// empty until each `*.functions.ts` file is re-transformed on demand.
//
// Fix: warm-load every `*.functions.ts(x)` file on server start and after
// restarts by walking `src/` and calling `ssrLoadModule` on each match. That
// forces the server-fn plugin to see every ID before the first client call.
function serverFnManifestRegen(): Plugin {
  const isServerFnFile = (file: string) => /\.functions\.tsx?$/.test(file);
  let pending: NodeJS.Timeout | null = null;

  async function findServerFnFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string) {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name.startsWith(".")) continue;
          await walk(full);
        } else if (e.isFile() && isServerFnFile(full)) {
          out.push(full);
        }
      }
    }
    await walk(root);
    return out;
  }

  async function warmLoad(server: ViteDevServer) {
    const srcRoot = path.join(server.config.root, "src");
    const files = await findServerFnFiles(srcRoot);
    // Trigger the server-fn plugin in EVERY environment so both the SSR-side
    // slug IDs (e.g. "src_lib_...--getLiveTick_createServerFn_handler") and
    // the client-side base64 IDs get registered in the manifest. Using
    // ssrLoadModule alone only registers the SSR flavor, so client bundles
    // that POST with a base64 ID still 500 with "Invalid server function ID".
    const envs = (server as unknown as { environments?: Record<string, { transformRequest?: (url: string) => Promise<unknown> }> }).environments;
    await Promise.allSettled(
      files.flatMap((f) => {
        const tasks: Array<Promise<unknown>> = [server.ssrLoadModule(f).catch(() => undefined)];
        if (envs) {
          for (const env of Object.values(envs)) {
            if (typeof env.transformRequest === "function") {
              tasks.push(env.transformRequest(f).catch(() => undefined));
            }
          }
        }
        return tasks;
      }),
    );
    server.config.logger.info(
      `[serverfn-manifest-regen] warm-loaded ${files.length} server-fn module(s) across ${envs ? Object.keys(envs).length : 1} environment(s)`,
    );
  }

  return {
    name: "lovable:serverfn-manifest-regen",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("listening", () => { void warmLoad(server); });
    },
    // handleHotUpdate fires on every file change Vite watches (across all
    // environments), unlike `server.watcher` which in Vite 7 only surfaces a
    // subset. This is the reliable place to notice server-fn edits.
    async handleHotUpdate(ctx) {
      if (!isServerFnFile(ctx.file)) return;
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        ctx.server.config.logger.info(
          `[serverfn-manifest-regen] server-fn file changed (${ctx.file}) — warm-loading manifest`,
        );
        const mod = ctx.server.moduleGraph.getModuleById(ctx.file);
        if (mod) ctx.server.moduleGraph.invalidateModule(mod);
        void warmLoad(ctx.server);
      }, 400);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [serverFnManifestRegen()],
    server: {
      // Allow the jenvu.com subdomains so dev/preview can serve them too.
      allowedHosts: [".jenvu.com", ".lovable.app", "localhost"],
    },
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        "entities": path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
});
