import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/env-probe")({
  server: {
    handlers: {
      GET: async () => {
        const s = process.env.CRON_SECRET || "";
        return Response.json({ hasCronSecret: Boolean(s), len: s.length, head: s.slice(0, 6) });
      },
    },
  },
});
