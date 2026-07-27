import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
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
import { exportToCsv } from "@/lib/export";

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

function Plates() {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);

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
                (data?.rows ?? []).map((p) => ({
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

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              placeholder="Search plate ID (PLT-000001)…"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="partially_used">Partially used</SelectItem>
                <SelectItem value="fully_consumed">Fully consumed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (data?.rows.length ?? 0) === 0 ? (
            <EmptyState title="No plates found" description="Receive stock to generate individual plates." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                    {data?.rows.map((p) => (
                      <TableRow key={p.id}>
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
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * PAGE_SIZE >= (data?.count ?? 0)}
                    onClick={() => setPage((p) => p + 1)}
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
