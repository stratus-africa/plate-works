import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PERMISSIONS, ROLE_LABELS, useAuth, type AppRole } from "@/lib/auth";
import { audit } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "Role Management — PlateWorks" },
      {
        name: "description",
        content: "Assign production roles, apply role templates and revoke access with confirmation.",
      },
    ],
  }),
  component: RoleManagement,
});

const ROLE_TEMPLATES: { name: string; description: string; roles: AppRole[] }[] = [
  {
    name: "Shop-floor operator",
    description: "Create jobs, record production, scan and consume material.",
    roles: ["production_operator"],
  },
  {
    name: "Store keeper",
    description: "Receive stock, manage offcuts and warehouse transfers.",
    roles: ["store_keeper"],
  },
  {
    name: "Production lead",
    description: "Approve jobs plus everything an operator can do.",
    roles: ["production_manager", "production_operator"],
  },
  {
    name: "Management (read-only)",
    description: "Reports and dashboards only.",
    roles: ["management"],
  },
  {
    name: "System administrator",
    description: "Full access including user and role management.",
    roles: ["administrator"],
  },
];

const permissionsFor = (roles: AppRole[]) =>
  (Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).filter((p) =>
    roles.some((r) => (PERMISSIONS[p] as AppRole[]).includes(r)),
  );

const humanise = (s: string) => s.replace(/([A-Z])/g, " $1").toLowerCase();

function RoleManagement() {
  const queryClient = useQueryClient();
  const { can, refreshRoles, user } = useAuth();
  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<{
    userId: string;
    name: string;
    role: AppRole;
  } | null>(null);
  const [templateTarget, setTemplateTarget] = useState<{ userId: string; name: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["role-management"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email").order("full_name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return { profiles: profiles.data ?? [], roles: roles.data ?? [] };
    },
  });

  const rolesOf = (userId: string) =>
    (data?.roles ?? []).filter((r) => r.user_id === userId).map((r) => r.role as AppRole);

  const setRoles = useMutation({
    mutationFn: async ({ userId, next }: { userId: string; next: AppRole[] }) => {
      const current = rolesOf(userId);
      const toAdd = next.filter((r) => !current.includes(r));
      const toRemove = current.filter((r) => !next.includes(r));
      if (toAdd.length) {
        const { error } = await supabase
          .from("user_roles")
          .insert(toAdd.map((role) => ({ user_id: userId, role })));
        if (error) throw error;
        await audit("grant_role", "user_roles", userId, null, { roles: toAdd });
      }
      for (const role of toRemove) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
        await audit("revoke_role", "user_roles", userId, { role }, null);
      }
    },
    onSuccess: async () => {
      toast.success("Roles updated");
      setRevokeTarget(null);
      setTemplateTarget(null);
      await refreshRoles();
      queryClient.invalidateQueries({ queryKey: ["role-management"] });
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.profiles ?? [];
    if (!q) return list;
    return list.filter((p) => {
      const roles = rolesOf(p.id).map((r) => ROLE_LABELS[r].toLowerCase());
      return [p.full_name, p.email, ...roles]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search]);

  if (!can("manageUsers")) {
    return (
      <PageHeader
        title="Role Management"
        description="Only administrators can view and change role assignments."
      />
    );
  }

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <PageHeader
        title="Role Management"
        description="Search people, apply role templates and revoke access with a confirmation step."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Role templates
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_TEMPLATES.map((t) => (
            <div key={t.name} className="rounded-md border p-3">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.roles.map((r) => (
                  <Badge key={r} variant="secondary" className="text-[11px]">
                    {ROLE_LABELS[r]}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> People ({filtered.length})
          </CardTitle>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, email or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <EmptyState title="No people match this search" />
          ) : (
            filtered.map((p) => {
              const current = rolesOf(p.id);
              const perms = permissionsFor(current);
              const isSelf = p.id === user?.id;
              return (
                <div key={p.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {p.full_name || "—"}{" "}
                        {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{p.email ?? "—"}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTemplateTarget({ userId: p.id, name: p.full_name || p.email || "user" })
                      }
                    >
                      <Sparkles className="mr-2 h-3.5 w-3.5" /> Apply template
                    </Button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {current.length === 0 ? (
                      <Badge variant="outline">No roles assigned</Badge>
                    ) : (
                      current.map((r) => (
                        <Badge key={r} variant="secondary" className="gap-1 pr-1">
                          {ROLE_LABELS[r]}
                          <button
                            type="button"
                            aria-label={`Revoke ${ROLE_LABELS[r]} from ${p.full_name || p.email}`}
                            className="rounded-sm p-0.5 hover:bg-destructive/20"
                            onClick={() =>
                              setRevokeTarget({
                                userId: p.id,
                                name: p.full_name || p.email || "this user",
                                role: r,
                              })
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>

                  <Separator className="my-3" />

                  <div className="flex flex-wrap gap-4">
                    {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => {
                      const enabled = current.includes(r);
                      return (
                        <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={enabled}
                            disabled={setRoles.isPending}
                            onCheckedChange={(v) => {
                              if (v === true) {
                                setRoles.mutate({ userId: p.id, next: [...current, r] });
                              } else {
                                setRevokeTarget({
                                  userId: p.id,
                                  name: p.full_name || p.email || "this user",
                                  role: r,
                                });
                              }
                            }}
                          />
                          {ROLE_LABELS[r]}
                        </label>
                      );
                    })}
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Effective permissions:{" "}
                    {perms.length === 0 ? "none" : perms.map(humanise).join(", ")}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke {revokeTarget ? ROLE_LABELS[revokeTarget.role] : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.name} will immediately lose every permission granted only by this
              role. This action is recorded in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep role</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!revokeTarget) return;
                setRoles.mutate({
                  userId: revokeTarget.userId,
                  next: rolesOf(revokeTarget.userId).filter((r) => r !== revokeTarget.role),
                });
              }}
            >
              Revoke role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!templateTarget} onOpenChange={(v) => !v && setTemplateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply a role template</DialogTitle>
            <DialogDescription>
              Replaces every current role of {templateTarget?.name} with the template roles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ROLE_TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                disabled={setRoles.isPending}
                className="w-full rounded-md border p-3 text-left transition hover:border-primary hover:bg-accent/30 disabled:opacity-60"
                onClick={() =>
                  templateTarget &&
                  setRoles.mutate({ userId: templateTarget.userId, next: t.roles })
                }
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateTarget(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Label className="sr-only">Role management</Label>
    </div>
  );
}
