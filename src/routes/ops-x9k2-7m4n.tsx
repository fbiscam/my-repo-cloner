import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ops-x9k2-7m4n")({
  head: () => ({
    meta: [
      { title: "Ops Console" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <Outlet />,
});