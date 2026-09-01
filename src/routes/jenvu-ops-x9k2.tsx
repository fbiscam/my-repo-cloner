import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/jenvu-ops-x9k2")({
  head: () => ({
    meta: [
      { title: "Admin — Jenvu" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <Outlet />,
});
