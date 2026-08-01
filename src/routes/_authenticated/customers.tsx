import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Pencil, Trash2, Upload, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/lib/auth";
import { audit } from "@/lib/data";
import { exportToCsv } from "@/lib/export";
import { parseCustomerCsv, type ParsedCustomerRow } from "@/lib/customer-import";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useRowSelection } from "@/components/bulk-bar";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — PlateWorks" },
      { name: "description", content: "Customer directory for production jobs and sales orders." },
    ],
  }),
  component: Customers,
});

const schema = z.object({
  company: z.string().trim().min(2, "Company must be at least 2 characters").max(120),
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

const emptyForm = {
  company: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
};

type FormKey = keyof typeof emptyForm;

function Customers() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; company: string } | null>(null);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ParsedCustomerRow[] | null>(null);
  const [importFileName, setImportFileName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await supabase.from("customers").select("*").order("company")).data ?? [],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((c) =>
      [c.company, c.contact_person, c.email, c.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, search]);

  const selection = useRowSelection(filtered.map((c) => c.id));
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
    // Duplicate detection on company name / email within the directory.
    const company = result.data.company.toLowerCase();
    const email = (result.data.email ?? "").toLowerCase();
    const clash = (data ?? []).find(
      (c) =>
        c.id !== editingId &&
        (c.company?.toLowerCase() === company ||
          (email && c.email?.toLowerCase() === email)),
    );
    if (clash) {
      setErrors({ company: `A customer already exists: ${clash.company}` });
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
        company: parsed.company,
        contact_person: parsed.contact_person || null,
        phone: parsed.phone || null,
        email: parsed.email || null,
        address: parsed.address || null,
      };
      if (editingId) {
        const before = data?.find((c) => c.id === editingId) ?? null;
        const { data: updated, error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw error;
        await audit("update_customer", "customers", editingId, before, updated);
      } else {
        const { data: created, error } = await supabase
          .from("customers")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await audit("create_customer", "customers", created.id, null, created);
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Customer updated" : "Customer added");
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const before = data?.find((c) => c.id === id) ?? null;
      const { count } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id);
      if ((count ?? 0) > 0) {
        throw new Error(`Cannot delete — ${count} job(s) reference this customer.`);
      }
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      await audit("delete_customer", "customers", id, before, null);
    },
    onSuccess: () => {
      toast.success("Customer deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bulkRemove = useMutation({
    mutationFn: async () => {
      const ids = selection.selectedIds;
      const { data: linked } = await supabase
        .from("jobs")
        .select("customer_id")
        .in("customer_id", ids);
      const blocked = new Set((linked ?? []).map((j) => j.customer_id));
      const deletable = ids.filter((id) => !blocked.has(id));
      if (deletable.length === 0) {
        throw new Error("All selected customers are referenced by existing jobs.");
      }
      const { error } = await supabase.from("customers").delete().in("id", deletable);
      if (error) throw error;
      await audit("bulk_delete_customers", "customers", null, { ids: deletable }, null);
      return { deleted: deletable.length, skipped: ids.length - deletable.length };
    },
    onSuccess: ({ deleted, skipped }) => {
      toast.success(
        `${deleted} customer(s) deleted${skipped ? ` — ${skipped} skipped (linked to jobs)` : ""}`,
      );
      setBulkDeleteOpen(false);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const runImport = useMutation({
    mutationFn: async () => {
      const rows = (importRows ?? []).filter((r) => r.status === "new");
      if (rows.length === 0) throw new Error("Nothing to import");
      const { data: created, error } = await supabase
        .from("customers")
        .insert(rows.map((r) => r.values))
        .select();
      if (error) throw error;
      await audit("import_customers", "customers", null, null, {
        file: importFileName,
        imported: created?.length ?? 0,
      });
      return created?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} customer(s) imported`);
      setImportOpen(false);
      setImportRows(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setImportFileName(file.name);
    try {
      setImportRows(parseCustomerCsv(text, data ?? []));
      setImportOpen(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

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

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  };

  const openEdit = (c: NonNullable<typeof data>[number]) => {
    setEditingId(c.id);
    setForm({
      company: c.company ?? "",
      contact_person: c.contact_person ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
    });
    setErrors({});
    setOpen(true);
  };

  const newCount = (importRows ?? []).filter((r) => r.status === "new").length;
  const dupCount = (importRows ?? []).filter((r) => r.status === "duplicate").length;
  const badCount = (importRows ?? []).filter((r) => r.status === "invalid").length;

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Companies placing production jobs."
        actions={
          can("manageCustomers") && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" /> Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  exportToCsv("customers", [
                    { company: "", contact_person: "", phone: "", email: "", address: "" },
                  ])
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV template
              </Button>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Add customer
              </Button>
            </div>
          )
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
            <DialogTitle>{editingId ? "Edit customer" : "New customer"}</DialogTitle>
            <DialogDescription>
              Company is required and must be unique. Email must be a valid address.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {field("company", "Company")}
            {field("contact_person", "Contact person")}
            {field("phone", "Phone")}
            {field("email", "Email")}
            {field("address", "Address")}
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {editingId ? "Save changes" : "Save customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import customers</DialogTitle>
            <DialogDescription>
              {importFileName} — {newCount} new, {dupCount} duplicate, {badCount} invalid.
              Duplicates and invalid rows are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(importRows ?? []).map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="numeric">{r.line}</TableCell>
                    <TableCell>{r.values.company || "—"}</TableCell>
                    <TableCell>{r.values.email || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "new"
                            ? "default"
                            : r.status === "duplicate"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {r.status === "new" ? "Will import" : r.reason}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => runImport.mutate()}
              disabled={runImport.isPending || newCount === 0}
            >
              Import {newCount} customer(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.company}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the customer from the directory. Customers referenced by
              existing jobs cannot be deleted.
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
              Delete customer
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
              placeholder="Search company, contact, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState title={search ? "No matching customers" : "No customers yet"} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.company}</TableCell>
                    <TableCell>{c.contact_person ?? "—"}</TableCell>
                    <TableCell className="numeric">{c.phone ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{c.address ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {can("manageCustomers") ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit {c.company}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget({ id: c.id, company: c.company })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            <span className="sr-only">Delete {c.company}</span>
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
