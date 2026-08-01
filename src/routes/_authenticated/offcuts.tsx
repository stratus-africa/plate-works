import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi-card";
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
import { Recycle, Scissors } from "lucide-react";

export const Route = createFileRoute("/_authenticated/offcuts")({
  head: () => ({
    meta: [
      { title: "Offcuts — PlateWorks" },
      { name: "description", content: "Reusable plate offcuts, their dimensions, status and parent plate." },
    ],
  }),
  component: Offcuts,
});

const OFFCUT_STATUSES = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "used", label: "Used" },
  { value: "scrapped", label: "Scrapped" },
] as const;

function Offcuts() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState("all");
  const [minWidth, setMinWidth] = useState("");
  const [minHeight, setMinHeight] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["offcuts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offcuts")
        .select("*, plates(plate_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (data ?? []).filter(
    (o) =>
      (status === "all" || o.status === status) &&
      (!minWidth || Number(o.width) >= Number(minWidth)) &&
      (!minHeight || Number(o.height) >= Number(minHeight)),
  );

  const selection = useRowSelection(rows.map((r) => r.id));
  const canManage = can("manageOffcuts");

  const available = (data ?? []).filter((o) => o.status === "available");
  const used = (data ?? []).filter((o) => o.status === "used");
  const reclaimedArea = used.reduce((s, o) => s + Number(o.area ?? 0), 0);

  const bulkUpdate = useMutation({
    mutationFn: async (nextStatus: string) => {
      const ids = selection.selectedIds;
      const { error } = await supabase
        .from("offcuts")
        .update({ status: nextStatus as never })
        .in("id", ids);
      if (error) throw error;
      await audit("bulk_update_offcuts", "offcuts", null, null, { ids, status: nextStatus });
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} offcut(s) updated`);
      setBulkStatus("");
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["offcuts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = selection.selectedIds;
      const { error } = await supabase.from("offcuts").delete().in("id", ids);
      if (error) throw error;
      await audit("bulk_delete_offcuts", "offcuts", null, { ids }, null);
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} offcut(s) deleted`);
      setConfirmDelete(false);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ["offcuts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <PageHeader
        title="Offcut Management"
        description="Remaining material is turned into reusable inventory and consumed before new plates."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              exportToCsv(
                "offcuts",
                rows.map((o) => ({
                  offcut: o.offcut_code,
                  parent_plate: o.plates?.plate_code ?? "",
                  width: o.width,
                  height: o.height,
                  area: o.area,
                  shape: o.shape,
                  status: o.status,
                  created: o.created_at,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        }
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} offcut(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected offcuts. Offcuts allocated to a job cannot be
              deleted — scrap them instead.
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
              Delete offcuts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Available offcuts" value={available.length} icon={Scissors} tone="success" />
        <KpiCard label="Offcuts reused" value={used.length} icon={Recycle} tone="info" />
        <KpiCard
          label="Material reclaimed"
          value={`${Math.round(reclaimedArea).toLocaleString()} in²`}
          icon={Trash2}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-3">
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
                {OFFCUT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Min width"
              className="w-32"
              value={minWidth}
              onChange={(e) => setMinWidth(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Min height"
              className="w-32"
              value={minHeight}
              onChange={(e) => setMinHeight(e.target.value)}
            />
          </div>

          {canManage && (
            <div className="mb-4">
              <BulkBar count={selection.count} noun="offcut" onClear={selection.clear}>
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
                    {OFFCUT_STATUSES.map((s) => (
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
            <EmptyState
              title="No offcuts"
              description="Offcuts are generated automatically when production is completed."
            />
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
                    <TableHead>Offcut ID</TableHead>
                    <TableHead>Parent plate</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Area</TableHead>
                    <TableHead>Shape</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow key={o.id} data-state={selection.selected.has(o.id) ? "selected" : undefined}>
                      {canManage && (
                        <TableCell>
                          <RowCheckbox
                            label={o.offcut_code}
                            checked={selection.selected.has(o.id)}
                            onChange={(on) => selection.toggle(o.id, on)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="numeric font-medium">{o.offcut_code}</TableCell>
                      <TableCell>{o.plates?.plate_code ?? "—"}</TableCell>
                      <TableCell className="numeric text-right">
                        {Number(o.width).toFixed(1)}×{Number(o.height).toFixed(1)}"
                      </TableCell>
                      <TableCell className="numeric text-right">{Number(o.area).toFixed(0)}</TableCell>
                      <TableCell className="capitalize">{o.shape}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(o.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
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
