import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/students/$id")({
  component: () => <AppShell><Outlet /></AppShell>,
});
