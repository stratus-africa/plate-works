import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "administrator"
  | "production_manager"
  | "production_operator"
  | "store_keeper"
  | "management";

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: "Administrator",
  production_manager: "Production Manager",
  production_operator: "Production Operator",
  store_keeper: "Store Keeper",
  management: "Management",
};

/** Capability matrix — the single source of truth for role based access. */
export const PERMISSIONS = {
  manageUsers: ["administrator"],
  approveJobs: ["administrator", "production_manager"],
  createJobs: ["administrator", "production_manager", "production_operator"],
  recordProduction: ["administrator", "production_manager", "production_operator"],
  receiveStock: ["administrator", "store_keeper", "production_manager"],
  manageOffcuts: ["administrator", "store_keeper", "production_manager"],
  manageCustomers: ["administrator", "production_manager", "production_operator"],
  viewReports: [
    "administrator",
    "production_manager",
    "production_operator",
    "store_keeper",
    "management",
  ],
} satisfies Record<string, AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  can: (permission: Permission) => boolean;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (userId: string | undefined) => {
    if (!userId) {
      setRoles([]);
      return;
    }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setTimeout(() => void loadRoles(nextSession.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRoles(data.session?.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      roles,
      loading,
      hasRole: (role) => roles.includes(role),
      can: (permission) => roles.some((r) => (PERMISSIONS[permission] as AppRole[]).includes(r)),
      refreshRoles: () => loadRoles(session?.user.id),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, roles, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
