import "./lib/error-capture";

// Eagerly register all server-fn modules with the Worker runtime so their
// handler IDs are present in the manifest before the first client call.
// Without these static imports, lazy `getServerFnById()` lookups fail with
// "Server function info not found for ..." on Cloudflare Workers (the dev
// warm-loader in vite.config.ts covers dev only).
import "./lib/gold-analysis.functions";
import "./lib/signal-agent.functions";
import "./lib/signal-alerts.functions";
import "./lib/news.functions";
import "./lib/credits.functions";
import "./lib/contact.functions";
import "./lib/voice-history.functions";
import "./lib/backtest.functions";
import "./lib/backtest-historical.functions";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";


type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Subdomain mounting and dashboard URL rewriting are handled in
// src/lib/url-rewrite.ts and applied by the router in src/router.tsx.
// On the server we also redirect old subdomain URLs and legacy /dashboard/*
// paths to the clean apex-domain URLs.
import { apexRedirectTarget } from "./lib/url-rewrite";


export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const target = apexRedirectTarget(new URL(request.url));
      if (target) return Response.redirect(target, 301);

      const handler = await getServerEntry();

      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);

    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
