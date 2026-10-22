import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BusinessProvider } from "@/lib/business";
import { AppShell } from "@/components/app/AppShell";
import { ErrorState } from "@/components/app/states";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: () => (
    <BusinessProvider>
      <AppShell><Outlet /></AppShell>
    </BusinessProvider>
  ),
  errorComponent: ({ error, reset }) => <ErrorState error={error} onRetry={reset} />,
});
