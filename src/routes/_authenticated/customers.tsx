import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Plus } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  company: z.string().trim().min(2, "Company is required").max(120),
  contact_person: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
});

function Customers() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await supabase.from("customers").select("*").order("company")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      const { data, error } = await supabase
        .from("customers")
        .insert({ ...parsed, email: parsed.email || null })
        .select()
        .single();
      if (error) throw error;
      await audit("create_customer", "customers", data.id, null, data);
    },
    onSuccess: () => {
      toast.success("Customer added");
      setOpen(false);
      setForm({ company: "", contact_person: "", phone: "", email: "", address: "" });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) =>
      toast.error(err instanceof z.ZodError ? err.issues[0].message : (err as Error).message),
  });

  const field = (key: keyof typeof form, label: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Companies placing production jobs."
        actions={
          can("manageCustomers") && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Add customer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New customer</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  {field("company", "Company")}
                  {field("contact_person", "Contact person")}
                  {field("phone", "Phone")}
                  {field("email", "Email")}
                  {field("address", "Address")}
                </div>
                <DialogFooter>
                  <Button onClick={() => create.mutate()} disabled={create.isPending}>
                    Save customer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (data ?? []).length === 0 ? (
            <EmptyState title="No customers yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.company}</TableCell>
                    <TableCell>{c.contact_person ?? "—"}</TableCell>
                    <TableCell className="numeric">{c.phone ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{c.address ?? "—"}</TableCell>
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
