import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NewsletterSubscriber = {
  id: string;
  email: string;
  status: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
  created_at: string;
};

async function assertAdmin(supabase: any, userId: string) {
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabase, userId);
  if (!ok) throw new Error("Forbidden: admin access required");
}

export const listNewsletterSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NewsletterSubscriber[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("newsletter_subscribers")
      .select("id,email,status,subscribed_at,unsubscribed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as NewsletterSubscriber[];
  });
