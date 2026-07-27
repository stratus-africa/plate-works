import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, useAuth, type AppRole } from "@/lib/auth";
import { audit } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — PlateWorks" },
      { name: "description", content: "Manage users, roles and audit trail for the production system." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const queryClient = useQueryClient();
  const { can, refreshRoles } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const [profiles, roles, logs] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      return { profiles: profiles.data ?? [], roles: roles.data ?? [], logs: logs.data ?? [] };
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error: delError } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delError) throw delError;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      await audit("set_role", "user_roles", userId, null, { role });
    },
    onSuccess: async () => {
      toast.success("Role updated");
      await refreshRoles();
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const roleOf = (userId: string) =>
    (data.roles.find((r) => r.user_id === userId)?.role as AppRole | undefined) ?? undefined;

  return (
    <div>
      <PageHeader title="Settings" description="Users, roles and audit trail." />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Users & roles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                  <TableCell>{p.email ?? "—"}</TableCell>
                  <TableCell>
                    {can("manageUsers") ? (
                      <Select
                        value={roleOf(p.id) ?? ""}
                        onValueChange={(v) => setRole.mutate({ userId: p.id, role: v as AppRole })}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder="Assign role" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">
                        {roleOf(p.id) ? ROLE_LABELS[roleOf(p.id) as AppRole] : "No role"}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!can("manageUsers") && (
            <p className="mt-3 text-sm text-muted-foreground">
              Only administrators can change roles.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{new Date(l.created_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{l.action.replace(/_/g, " ")}</TableCell>
                    <TableCell>{l.entity}</TableCell>
                    <TableCell className="numeric max-w-[180px] truncate text-xs">
                      {l.entity_id ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                      {l.device ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
