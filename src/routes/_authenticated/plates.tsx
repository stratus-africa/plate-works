import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/plates")({
  head: () => ({
    meta: [
      { title: "Plates — PlateWorks" },
      { name: "description", content: "Individually tracked printing plates with status and remaining area." },
    ],
  }),
  component: Plates,
});

const PAGE_SIZE = 25;

const PLATE_STATUSES = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "partially_used", label: "Partially used" },
  { value: "fully_consumed", label: "Fully consumed" },
] as const;

function Plates() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [bulkStatus, setBulkStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["plates", status, page, term],
    queryFn: async () => {
      let query = supabase
        .from("plates")
        .select("*, plate_batches(batch_number, manufacturers(name))", { count: "exact" })
        .order("plate_code")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") query = query.eq("status", status as never);
      if (term) query = query.ilike("plate_code", `%${term}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const selection = useRowSelection(rows.map((r) => r.id));
  const canManage = can("manageOffcuts");

  const bulkUpdate = useMutation({
    mutationFn: async (nextStatus: string) => {
      const ids = selection.selectedIds;
      const { error } = await supabase
        .from("plates")
        .update({ status: nextStatus as never })
        .in("id", ids);
      if (error) throw error;
      await audit("bulk_update_plates", "plates", null, null, { ids, status: nextStatus });
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} plate(s) updated`);
      setBulkStatus("");
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["plates"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = selection.selectedIds;
      const { error } = await supabase.from("plates").delete().in("id", ids);
      if (error) throw error;
      await audit("bulk_delete_plates", "plates", null, { ids }, null);
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} plate(s) deleted`);
      setConfirmDelete(false);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["plates"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <PageHeader
        title="Individual Plates"
        description="Every plate carries a unique ID and is traceable to its batch."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              exportToCsv(
                "plates",
                rows.map((p) => ({
                  plate: p.plate_code,
                  batch: p.plate_batches?.batch_number ?? "",
                  width: p.width,
                  height: p.height,
                  area: p.area,
                  remaining_area: p.remaining_area,
                  status: p.status,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export page
          </Button>
        }
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} plate(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected plates. Plates already allocated to a job
              cannot be deleted.
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
              Delete plates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              placeholder="Search plate ID (PLT-000001)…"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(0);
                selection.clear();
              }}
              className="max-w-xs"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
                selection.clear();
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PLATE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canManage && (
            <div className="mb-4">
              <BulkBar count={selection.count} noun="plate" onClear={selection.clear}>
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
                    {PLATE_STATUSES.map((s) => (
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
            <EmptyState title="No plates found" description="Receive stock to generate individual plates." />
          ) : (
            <>
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
                      <TableHead>Plate ID</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Area</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id} data-state={selection.selected.has(p.id) ? "selected" : undefined}>
                        {canManage && (
                          <TableCell>
                            <RowCheckbox
                              label={p.plate_code}
                              checked={selection.selected.has(p.id)}
                              onChange={(on) => selection.toggle(p.id, on)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="numeric font-medium">{p.plate_code}</TableCell>
                        <TableCell>{p.plate_batches?.batch_number ?? "—"}</TableCell>
                        <TableCell>{p.plate_batches?.manufacturers?.name ?? "—"}</TableCell>
                        <TableCell className="numeric text-right">
                          {p.width}×{p.height}"
                        </TableCell>
                        <TableCell className="numeric text-right">{Number(p.area).toFixed(0)}</TableCell>
                        <TableCell className="numeric text-right">
                          {Number(p.remaining_area).toFixed(0)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>{data?.count} plates</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => {
                      setPage((p) => p - 1);
                      selection.clear();
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * PAGE_SIZE >= (data?.count ?? 0)}
                    onClick={() => {
                      setPage((p) => p + 1);
                      selection.clear();
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
