import { supabase } from "@/integrations/supabase/client";

export async function logActivity(action: string, entity: string, entity_id?: string | null, after?: unknown) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      user_id: user?.id ?? null,
      action,
      entity,
      entity_id: entity_id ?? null,
      after: (after ?? null) as never,
    });
  } catch (e) {
    console.warn("فشل تسجيل النشاط", e);
  }
}
