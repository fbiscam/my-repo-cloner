import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/jenvu-ops-x9k2/")({
  head: () => ({
    meta: [
      { title: "Support Inbox — Jenvu" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/jenvu-ops-x9k2/inbox", replace: true });
  },
  component: () => null,
});
