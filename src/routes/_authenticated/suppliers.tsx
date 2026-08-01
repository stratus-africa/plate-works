import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Pencil, Trash2, Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useRowSelection } from "@/components/bulk-bar";
import { useAuth } from "@/lib/auth";
import { audit } from "@/lib/data";
import { exportToCsv } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — PlateWorks" },
      { name: "description", content: "Supplier directory for plate batch purchasing and stock intake." },
      { property: "og:title", content: "Suppliers — PlateWorks" },
      { property: "og:description", content: "Manage the suppliers that deliver printing plate stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Suppliers,
});

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  contact_person: z.string().trim().max(100).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-\s]*$/, "Phone may only contain digits and + ( ) -")
    .optional(),
  email: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
});

const emptyForm = { name: "", contact_person: "", phone: "", email: "", address: "" };
type FormKey = keyof typeof emptyForm;

function Suppliers() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("receiveStock");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((s) =>
      [s.name, s.contact_person, s.email, s.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, search]);

  const selection = useRowSelection(filtered.map((s) => s.id));

  const validate = () => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const next: Partial<Record<FormKey, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as FormKey;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return null;
    }
    const name = result.data.name.toLowerCase();
    const email = (result.data.email ?? "").toLowerCase();
    const clash = (data ?? []).find(
      (s) =>
        s.id !== editingId &&
        (s.name?.toLowerCase() === name || (email && s.email?.toLowerCase() === email)),
    );
    if (clash) {
      setErrors({ name: `A supplier already exists: ${clash.name}` });
      return null;
    }
    setErrors({});
    return result.data;
  };

  const save = useMutation({
    mutationFn: async () => {
      const parsed = validate();
      if (!parsed) throw new Error("Please fix the highlighted fields");
      const payload = {
        name: parsed.name,
        contact_person: parsed.contact_person || null,
        phone: parsed.phone || null,
        email: parsed.email || null,
        address: parsed.address || null,
      };
      if (editingId) {
        const before = data?.find((s) => s.id === editingId) ?? null;
        const { data: updated, error } = await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw error;
        await audit("update_supplier", "suppliers", editingId, before, updated);
      } else {
        const { data: created, error } = await supabase
          .from("suppliers")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await audit("create_supplier", "suppliers", created.id, null, created);
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Supplier updated" : "Supplier added");
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeIds = async (ids: string[]) => {
    const { data: linked } = await supabase
      .from("plate_batches")
      .select("supplier_id")
      .in("supplier_id", ids);
    const blocked = new Set((linked ?? []).map((b) => b.supplier_id));
    const deletable = ids.filter((id) => !blocked.has(id));
    if (deletable.length === 0) {
      throw new Error("Suppliers referenced by received batches cannot be deleted.");
    }
    const { error } = await supabase.from("suppliers").delete().in("id", deletable);
    if (error) throw error;
    await audit("delete_suppliers", "suppliers", null, { ids: deletable }, null);
    return { deleted: deletable.length, skipped: ids.length - deletable.length };
  };

  const remove = useMutation({
    mutationFn: (id: string) => removeIds([id]),
    onSuccess: () => {
      toast.success("Supplier deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkRemove = useMutation({
    mutationFn: () => removeIds(selection.selectedIds),
    onSuccess: ({ deleted, skipped }) => {
      toast.success(
        `${deleted} supplier(s) deleted${skipped ? ` — ${skipped} skipped (linked to batches)` : ""}`,
      );
      setBulkDeleteOpen(false);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkContact = useMutation({
    mutationFn: async (value: string) => {
      const ids = selection.selectedIds;
      const { error } = await supabase
        .from("suppliers")
        .update({ contact_person: value || null })
        .in("id", ids);
      if (error) throw error;
      await audit("bulk_update_suppliers", "suppliers", null, null, { ids, contact_person: value });
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} supplier(s) updated`);
      setBulkContactOpen(false);
      setBulkContactValue("");
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [bulkContactOpen, setBulkContactOpen] = useState(false);
  const [bulkContactValue, setBulkContactValue] = useState("");

  const field = (key: FormKey, label: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={form[key]}
        aria-invalid={!!errors[key]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [key]: e.target.value }));
          setErrors((x) => ({ ...x, [key]: undefined }));
        }}
      />
      {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Companies delivering plate stock into the warehouses."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  "suppliers",
                  filtered.map((s) => ({
                    name: s.name,
                    contact_person: s.contact_person ?? "",
                    phone: s.phone ?? "",
                    email: s.email ?? "",
                    address: s.address ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            {canManage && (
              <Button
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                  setErrors({});
                  setOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add supplier
              </Button>
            )}
          </div>
        }
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setEditingId(null);
            setForm(emptyForm);
            setErrors({});
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit supplier" : "New supplier"}</DialogTitle>
            <DialogDescription>Name is required and must be unique.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {field("name", "Supplier name")}
            {field("contact_person", "Contact person")}
            {field("phone", "Phone")}
            {field("email", "Email")}
            {field("address", "Address")}
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {editingId ? "Save changes" : "Save supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkContactOpen} onOpenChange={setBulkContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set contact person</DialogTitle>
            <DialogDescription>
              Applies to the {selection.count} selected supplier(s). Leave blank to clear it.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={bulkContactValue}
            placeholder="Contact person"
            onChange={(e) => setBulkContactValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkContactOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkContact.mutate(bulkContactValue.trim())}
              disabled={bulkContact.isPending}
            >
              Update {selection.count}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Suppliers referenced by received plate batches cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) remove.mutate(deleteTarget.id);
              }}
            >
              Delete supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} supplier(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Selected suppliers linked to received batches are skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bulkRemove.mutate();
              }}
            >
              Delete suppliers
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search supplier, contact, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {canManage && (
            <BulkBar count={selection.count} noun="supplier" onClear={selection.clear}>
              <Button variant="outline" size="sm" onClick={() => setBulkContactOpen(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Set contact
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkRemove.isPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            </BulkBar>
          )}

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "No matching suppliers" : "No suppliers yet"}
              description="Add the companies you buy plate stock from."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-10">
                      <SelectAllCheckbox
                        allSelected={selection.allSelected}
                        someSelected={selection.someSelected}
                        onChange={selection.toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} data-state={selection.selected.has(s.id) ? "selected" : undefined}>
                    {canManage && (
                      <TableCell>
                        <RowCheckbox
                          label={s.name}
                          checked={selection.selected.has(s.id)}
                          onChange={(on) => selection.toggle(s.id, on)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.contact_person ?? "—"}</TableCell>
                    <TableCell className="numeric">{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.email ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{s.address ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingId(s.id);
                              setForm({
                                name: s.name ?? "",
                                contact_person: s.contact_person ?? "",
                                phone: s.phone ?? "",
                                email: s.email ?? "",
                                address: s.address ?? "",
                              });
                              setErrors({});
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit {s.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            <span className="sr-only">Delete {s.name}</span>
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
