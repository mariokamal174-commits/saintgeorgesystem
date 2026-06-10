import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "student_affairs" | "finance";
export type AccountStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  username: string;
  department: AppRole;
  status: AccountStatus;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => loadExtras(session.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadExtras(session.user.id);
      else setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadExtras(uid: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(p as Profile | null);
    setRoles((r ?? []).map((x: { role: AppRole }) => x.role));
    setLoading(false);
  }

  return {
    user, profile, roles, loading,
    isApproved: profile?.status === "approved",
    isAdmin: roles.includes("admin"),
    isFinance: roles.includes("finance"),
    isStudentAffairs: roles.includes("student_affairs"),
    signOut: async () => { await supabase.auth.signOut(); },
  };
}
