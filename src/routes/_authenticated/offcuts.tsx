import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
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
import { exportToCsv } from "@/lib/export";
import { Recycle, Scissors, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/offcuts")({
  head: () => ({
    meta: [
      { title: "Offcuts — PlateWorks" },
      { name: "description", content: "Reusable plate offcuts, their dimensions, status and parent plate." },
    ],
  }),
  component: Offcuts,
});

function Offcuts() {
  const [status, setStatus] = useState("all");
  const [minWidth, setMinWidth] = useState("");
  const [minHeight, setMinHeight] = useState("");

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

  const available = (data ?? []).filter((o) => o.status === "available");
  const used = (data ?? []).filter((o) => o.status === "used");
  const reclaimedArea = used.reduce((s, o) => s + Number(o.area ?? 0), 0);

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
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="scrapped">Scrapped</SelectItem>
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
                    <TableRow key={o.id}>
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
