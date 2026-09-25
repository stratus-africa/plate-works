import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { exportToCsv } from "@/lib/export";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useRowSelection } from "@/components/bulk-bar";
import { useAuth } from "@/lib/auth";
import { audit } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({
    meta: [
      { title: "Production Jobs — PlateWorks" },
      { name: "description", content: "All production jobs with plate requirements, utilisation and status." },
    ],
  }),
  component: Jobs,
});

const JOB_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "in_production", label: "In production" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

function Jobs() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [bulkStatus, setBulkStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, customers(company)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (data ?? []).filter(
    (j) =>
      (status === "all" || j.status === status) &&
      (j.job_number.toLowerCase().includes(term.toLowerCase()) ||
        j.product.toLowerCase().includes(term.toLowerCase()) ||
        (j.customers?.company ?? "").toLowerCase().includes(term.toLowerCase())),
  );

  const selection = useRowSelection(rows.map((r) => r.id));
  const canManage = can("approveJobs");

  const bulkUpdate = useMutation({
    mutationFn: async (nextStatus: string) => {
      const ids = selection.selectedIds;
      const { error } = await supabase
        .from("jobs")
        .update({
          status: nextStatus as never,
          completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
        })
        .in("id", ids);
      if (error) throw error;
      await audit("bulk_update_jobs", "jobs", null, null, { ids, status: nextStatus });
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} job(s) updated`);
      setBulkStatus("");
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = selection.selectedIds;
      // Remove dependent allocations first so the delete is not blocked.
      await supabase.from("plate_allocations").delete().in("job_id", ids);
      const { data, error } = await supabase.from("jobs").delete().in("id", ids).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You don't have permission to delete these jobs.");
      await audit("bulk_delete_jobs", "jobs", null, { ids }, null);
      return data.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} job(s) deleted`);
      setConfirmDelete(false);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <PageHeader
        title="Production Jobs"
        description="Jobs are optimised on receipt and allocated from offcuts before new plates."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  "jobs",
                  rows.map((j) => ({
                    job: j.job_number,
                    customer: j.customers?.company ?? "",
                    product: j.product,
                    artwork: `${j.artwork_width}x${j.artwork_height}`,
                    effective: `${j.effective_width}x${j.effective_height}`,
                    quantity: j.quantity,
                    plates_required: j.plates_required,
                    utilization: j.utilization,
                    status: j.status,
                    due_date: j.due_date,
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            {can("createJobs") && (
              <Button asChild>
                <Link to="/jobs/new">
                  <Plus className="mr-2 h-4 w-4" /> New job
                </Link>
              </Button>
            )}
          </>
        }
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} job(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected jobs and their plate allocations. Consumed
              material is not returned to stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bulkDelete.mutate();
              }}
            >
              Delete jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              placeholder="Search job, product or customer…"
              className="max-w-sm"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                selection.clear();
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {JOB_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canManage && (
            <div className="mb-4">
              <BulkBar count={selection.count} noun="job" onClear={selection.clear}>
                <Select
                  value={bulkStatus}
                  onValueChange={(v) => {
                    setBulkStatus(v);
                    bulkUpdate.mutate(v);
                  }}
                >
                  <SelectTrigger className="h-9 w-52">
                    <SelectValue placeholder="Set status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={bulkDelete.isPending}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </BulkBar>
            </div>
          )}

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState title="No jobs" description="Create a production job to run the optimisation engine." />
          ) : (
            <div className="overflow-x-auto">
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
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Effective size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Plates</TableHead>
                    <TableHead className="text-right">Utilisation</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((j) => (
                    <TableRow key={j.id} data-state={selection.selected.has(j.id) ? "selected" : undefined}>
                      {canManage && (
                        <TableCell>
                          <RowCheckbox
                            label={j.job_number}
                            checked={selection.selected.has(j.id)}
                            onChange={(on) => selection.toggle(j.id, on)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="numeric font-medium">
                        <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="hover:underline">
                          {j.job_number}
                        </Link>
                      </TableCell>
                      <TableCell>{j.customers?.company ?? "—"}</TableCell>
                      <TableCell>{j.product}</TableCell>
                      <TableCell className="numeric text-right">
                        {Number(j.effective_width).toFixed(1)}×{Number(j.effective_height).toFixed(1)}"
                      </TableCell>
                      <TableCell className="numeric text-right">{j.quantity}</TableCell>
                      <TableCell className="numeric text-right">{j.plates_required}</TableCell>
                      <TableCell className="numeric text-right">
                        {Number(j.utilization).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-sm">{j.due_date ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={j.status} />
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${j.job_number}`}
                            onClick={() => {
                              selection.clear();
                              selection.toggle(j.id, true);
                              setConfirmDelete(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
