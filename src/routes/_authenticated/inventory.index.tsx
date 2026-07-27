import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCsv } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/inventory/")({
  head: () => ({
    meta: [
      { title: "Plate Batches — PlateWorks" },
      { name: "description", content: "All received plate batches with available, reserved and used plates." },
    ],
  }),
  component: Batches,
});

const PAGE_SIZE = 12;

function Batches() {
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plate_batches")
        .select("*, manufacturers(name), suppliers(name), warehouses(name)")
        .order("date_received", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (data ?? []).filter((b) =>
    b.batch_number.toLowerCase().includes(term.toLowerCase()),
  );
  const paged = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Plate Batches"
        description="Boxes received are converted into individually tracked plates."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  "plate-batches",
                  rows.map((b) => ({
                    batch: b.batch_number,
                    manufacturer: b.manufacturers?.name ?? "",
                    type: b.plate_type,
                    boxes: b.boxes_received,
                    per_box: b.pieces_per_box,
                    total: b.total_plates,
                    available: b.available_plates,
                    reserved: b.reserved_plates,
                    used: b.used_plates,
                    received: b.date_received,
                    cost_per_plate: b.cost_per_plate,
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button asChild>
              <Link to="/inventory/receive">
                <PackagePlus className="mr-2 h-4 w-4" /> Receive stock
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Filter by batch number…"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(0);
            }}
            className="mb-4 max-w-sm"
          />

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState title="No batches yet" description="Receive your first delivery to start tracking plates." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Type / Size</TableHead>
                      <TableHead className="text-right">Boxes</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Reserved</TableHead>
                      <TableHead className="text-right">Used</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="numeric font-medium">{b.batch_number}</TableCell>
                        <TableCell>{b.manufacturers?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.plate_type} · {b.plate_width}×{b.plate_height}"
                        </TableCell>
                        <TableCell className="numeric text-right">
                          {b.boxes_received} × {b.pieces_per_box}
                        </TableCell>
                        <TableCell className="numeric text-right">{b.total_plates}</TableCell>
                        <TableCell className="numeric text-right text-success">
                          {b.available_plates}
                        </TableCell>
                        <TableCell className="numeric text-right">{b.reserved_plates}</TableCell>
                        <TableCell className="numeric text-right">{b.used_plates}</TableCell>
                        <TableCell className="text-sm">{b.date_received}</TableCell>
                        <TableCell>
                          <StatusBadge status={b.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {rows.length} batches · page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * PAGE_SIZE >= rows.length}
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
