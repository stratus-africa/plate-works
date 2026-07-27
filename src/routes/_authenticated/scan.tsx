import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Layers, Scissors, ClipboardList, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ScannerBody } from "@/components/code-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lookupCode, type ScanResult } from "@/lib/inventory";
import { audit, logTransaction, notify } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Scan & Consume — PlateWorks" },
      {
        name: "description",
        content:
          "Scan plate, offcut and job barcodes or QR codes to look up material and consume reserved plates instantly.",
      },
      { property: "og:title", content: "Scan & Consume — PlateWorks" },
      {
        property: "og:description",
        content: "Barcode and QR scanning for fast plate lookup and consumption on the shop floor.",
      },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [notFound, setNotFound] = useState<string | null>(null);

  const handleScan = async (raw: string) => {
    setNotFound(null);
    const found = await lookupCode(raw);
    if (!found) {
      setResult(null);
      setNotFound(raw);
      toast.error(`No plate, offcut or job matches "${raw}"`);
      return;
    }
    setResult(found);
    setHistory((h) => [found, ...h.filter((x) => x.id !== found.id)].slice(0, 8));
  };

  const consume = useMutation({
    mutationFn: async () => {
      if (!result) return;
      if (result.kind === "plate") {
        const plate = result.record as { id: string; status: string; plate_code: string; batch_id: string };
        if (plate.status === "fully_consumed") throw new Error("Plate already consumed");
        await supabase
          .from("plates")
          .update({ status: "fully_consumed", remaining_area: 0 })
          .eq("id", plate.id);
        const { data: batch } = await supabase
          .from("plate_batches")
          .select("reserved_plates,available_plates,used_plates")
          .eq("id", plate.batch_id)
          .maybeSingle();
        if (batch) {
          const fromReserved = plate.status === "reserved";
          await supabase
            .from("plate_batches")
            .update({
              reserved_plates: fromReserved
                ? Math.max(batch.reserved_plates - 1, 0)
                : batch.reserved_plates,
              available_plates: fromReserved
                ? batch.available_plates
                : Math.max(batch.available_plates - 1, 0),
              used_plates: batch.used_plates + 1,
            })
            .eq("id", plate.batch_id);
        }
        await logTransaction({
          transaction_type: "consumption",
          quantity: 1,
          plate_id: plate.id,
          reference: plate.plate_code,
          notes: "Consumed via barcode scan",
        });
        await audit("scan_consume", "plates", plate.id, { status: plate.status }, { status: "fully_consumed" });
        await notify("Plate consumed by scan", `${plate.plate_code} marked fully consumed.`, "info", "inventory");
      } else if (result.kind === "offcut") {
        const offcut = result.record as { id: string; status: string; offcut_code: string };
        if (offcut.status === "used") throw new Error("Offcut already used");
        await supabase.from("offcuts").update({ status: "used" }).eq("id", offcut.id);
        await logTransaction({
          transaction_type: "offcut_consumption",
          quantity: 1,
          offcut_id: offcut.id,
          reference: offcut.offcut_code,
          notes: "Consumed via barcode scan",
        });
        await audit("scan_consume", "offcuts", offcut.id, { status: offcut.status }, { status: "used" });
      }
    },
    onSuccess: async () => {
      toast.success("Material consumed and inventory updated");
      queryClient.invalidateQueries();
      if (result) void handleScan(result.code);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <PageHeader
        title="Scan & Consume"
        description="Scan a plate, offcut or job code with the camera or a hand-held reader to look it up and consume reserved material."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scanner</CardTitle>
          </CardHeader>
          <CardContent>
            <ScannerBody onScan={(code) => void handleScan(code)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!result && !notFound && (
              <EmptyState
                title="Nothing scanned yet"
                description="Scanned codes resolve to plates (PLT-…), offcuts (OFC-…) or jobs (JOB-…)."
              />
            )}
            {notFound && (
              <EmptyState title="Not found" description={`No record matches "${notFound}".`} />
            )}
            {result && <ResultCard result={result} />}

            {result && result.kind === "job" && (
              <Button asChild className="w-full">
                <Link to="/jobs/$jobId" params={{ jobId: result.id }}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Open job
                </Link>
              </Button>
            )}

            {result && result.kind !== "job" && can("recordProduction") && (
              <Button
                className="w-full"
                onClick={() => consume.mutate()}
                disabled={consume.isPending}
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                Consume {result.code}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {history.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Recent scans</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {history.map((h) => (
              <Button
                key={h.id}
                size="sm"
                variant="outline"
                className="font-mono"
                onClick={() => setResult(h)}
              >
                {h.kind === "plate" ? (
                  <Layers className="mr-2 h-3 w-3" />
                ) : h.kind === "offcut" ? (
                  <Scissors className="mr-2 h-3 w-3" />
                ) : (
                  <ClipboardList className="mr-2 h-3 w-3" />
                )}
                {h.code}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  const r = result.record as Record<string, never> & {
    status?: string;
    width?: number;
    height?: number;
    product?: string;
    quantity?: number;
    warehouses?: { name: string } | null;
    plate_batches?: { batch_number: string; plate_type: string } | null;
    customers?: { company: string } | null;
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="numeric text-lg font-semibold">{result.code}</p>
        <Badge variant="outline" className="capitalize">
          {result.kind}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        {r.status && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={r.status} />
          </div>
        )}
        {result.kind !== "job" && (
          <Line
            label="Size"
            value={`${Number(r.width).toFixed(1)}" × ${Number(r.height).toFixed(1)}"`}
          />
        )}
        {r.plate_batches && <Line label="Batch" value={r.plate_batches.batch_number} />}
        {r.warehouses && <Line label="Warehouse" value={r.warehouses.name} />}
        {result.kind === "job" && (
          <>
            <Line label="Product" value={String(r.product ?? "—")} />
            <Line label="Quantity" value={String(r.quantity ?? 0)} />
            <Line label="Customer" value={r.customers?.company ?? "—"} />
          </>
        )}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric">{value}</span>
    </div>
  );
}
