import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { adminCreateUser } from "@/lib/admin-users.functions";


export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — PlateWorks" },
      { name: "description", content: "Manage users, roles and audit trail for the production system." },
    ],
  }),
  component: Settings,
});

const emptyNewUser = {
  fullName: "",
  email: "",
  password: "",
  role: "production_operator" as AppRole,
};

const newUserSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function Settings() {
  const queryClient = useQueryClient();
  const { can, refreshRoles } = useAuth();
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);

  const createUser = useMutation({
    mutationFn: async () => {
      const parsed = newUserSchema.parse(newUser);
      const result = await adminCreateUser({ data: { ...parsed, role: newUser.role } });
      await audit("create_user", "auth.users", result.id, null, {
        email: parsed.email,
        role: newUser.role,
      });
    },
    onSuccess: () => {
      toast.success("User account created");
      setNewUserOpen(false);
      setNewUser(emptyNewUser);
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (err) =>
      toast.error(err instanceof z.ZodError ? err.issues[0].message : (err as Error).message),
  });



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

  const toggleRole = useMutation({
    mutationFn: async ({
      userId,
      role,
      enabled,
    }: {
      userId: string;
      role: AppRole;
      enabled: boolean;
    }) => {
      if (enabled) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
        await audit("grant_role", "user_roles", userId, null, { role });
      } else {
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
      await refreshRoles();
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const rolesOf = (userId: string) =>
    data.roles.filter((r) => r.user_id === userId).map((r) => r.role as AppRole);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Users, roles and audit trail."
        actions={
          can("manageUsers") && (
            <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" /> Create user
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create user account</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Full name</Label>
                    <Input
                      value={newUser.fullName}
                      onChange={(e) => setNewUser((u) => ({ ...u, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Work email</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temporary password</Label>
                    <Input
                      type="text"
                      value={newUser.password}
                      onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      At least 8 characters. Share it securely with the user.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={newUser.role}
                      onValueChange={(v) => setNewUser((u) => ({ ...u, role: v as AppRole }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => createUser.mutate()} disabled={createUser.isPending}>
                    Create account
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

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
                <TableHead>Roles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.profiles.map((p) => {
                const current = rolesOf(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                    <TableCell>{p.email ?? "—"}</TableCell>
                    <TableCell>
                      {can("manageUsers") ? (
                        <div className="flex flex-wrap gap-3">
                          {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => {
                            const enabled = current.includes(r);
                            return (
                              <label
                                key={r}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={enabled}
                                  disabled={toggleRole.isPending}
                                  onCheckedChange={(v) =>
                                    toggleRole.mutate({
                                      userId: p.id,
                                      role: r,
                                      enabled: v === true,
                                    })
                                  }
                                />
                                {ROLE_LABELS[r]}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {current.length === 0 ? (
                            <Badge variant="secondary">No role</Badge>
                          ) : (
                            current.map((r) => (
                              <Badge key={r} variant="secondary">
                                {ROLE_LABELS[r]}
                              </Badge>
                            ))
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {can("manageUsers") ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Need templates, search and revoke confirmations?{" "}
              <Link to="/roles" className="font-medium text-primary underline-offset-4 hover:underline">
                Open Role Management
              </Link>
              .
            </p>
          ) : (
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
