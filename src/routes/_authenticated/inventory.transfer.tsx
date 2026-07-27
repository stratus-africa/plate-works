import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { CodeScannerDialog } from "@/components/code-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { lookupCode, currentUserId, type ScanResult } from "@/lib/inventory";
import { audit, logTransaction } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/inventory/transfer")({
  head: () => ({
    meta: [
      { title: "Warehouse Transfers — PlateWorks" },
      {
        name: "description",
        content: "Move plates and offcuts between warehouse locations with a full transfer history.",
      },
      { property: "og:title", content: "Warehouse Transfers — PlateWorks" },
      {
        property: "og:description",
        content: "Record stock movements between warehouses and keep every location accurate.",
      },
    ],
  }),
  component: TransferPage,
});

function TransferPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [item, setItem] = useState<ScanResult | null>(null);
  const [toWarehouse, setToWarehouse] = useState("");
  const [notes, setNotes] = useState("");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => (await supabase.from("warehouses").select("*").order("name")).data ?? [],
  });

  const { data: transfers } = useQuery({
    queryKey: ["stock_transfers"],
    queryFn: async () =>
      (
        await supabase
          .from("stock_transfers")
          .select("*, plates(plate_code), offcuts(offcut_code)")
          .order("created_at", { ascending: false })
          .limit(30)
      ).data ?? [],
  });

  const warehouseName = (id: string | null) =>
    warehouses?.find((w) => w.id === id)?.name ?? "Unassigned";

  const resolve = async (raw: string) => {
    const found = await lookupCode(raw);
    if (!found || found.kind === "job") {
      setItem(null);
      toast.error("Scan a plate (PLT-…) or offcut (OFC-…) code");
      return;
    }
    setItem(found);
    setCode(found.code);
  };

  const transfer = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Scan or enter an item first");
      if (!toWarehouse) throw new Error("Choose a destination warehouse");
      const rec = item.record as unknown as { id: string; warehouse_id: string | null };
      if (rec.warehouse_id === toWarehouse) throw new Error("Item is already in that warehouse");

      const table = item.kind === "plate" ? "plates" : "offcuts";
      if (item.kind === "plate") {
        await supabase.from("plates").update({ warehouse_id: toWarehouse }).eq("id", rec.id);
      } else {
        await supabase.from("offcuts").update({ warehouse_id: toWarehouse }).eq("id", rec.id);
      }

      await supabase.from("stock_transfers").insert({
        plate_id: item.kind === "plate" ? rec.id : null,
        offcut_id: item.kind === "offcut" ? rec.id : null,
        item_type: item.kind,
        item_code: item.code,
        from_warehouse_id: rec.warehouse_id,
        to_warehouse_id: toWarehouse,
        reason: notes || null,
        performed_by: await currentUserId(),
      });


      await logTransaction({
        transaction_type: "transfer",
        quantity: 1,
        plate_id: item.kind === "plate" ? rec.id : undefined,
        offcut_id: item.kind === "offcut" ? rec.id : undefined,
        warehouse_id: toWarehouse,
        reference: item.code,
        notes: `Transferred to ${warehouseName(toWarehouse)}`,
      });
      await audit(
        "transfer_stock",
        table,
        rec.id,
        { warehouse_id: rec.warehouse_id },
        { warehouse_id: toWarehouse },
      );
    },
    onSuccess: () => {
      toast.success("Transfer recorded");
      setItem(null);
      setCode("");
      setNotes("");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const currentWarehouse = item
    ? warehouseName((item.record as unknown as { warehouse_id: string | null }).warehouse_id)
    : "—";

  return (
    <div>
      <PageHeader
        title="Warehouse transfer"
        description="Move a plate or offcut to another location. Every movement is logged for traceability."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">New transfer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Item code</Label>
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  placeholder="PLT-000123"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onBlur={() => code && void resolve(code)}
                />
                <CodeScannerDialog
                  onScan={(c) => void resolve(c)}
                  trigger={
                    <Button variant="outline" size="icon" aria-label="Scan code">
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
              {item && (
                <p className="text-xs text-muted-foreground">
                  {item.kind} · currently in <strong>{currentWarehouse}</strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Destination warehouse</Label>
              <Select value={toWarehouse} onValueChange={setToWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for the movement"
              />
            </div>

            <Button
              className="w-full"
              disabled={!can("receiveStock") || transfer.isPending}
              onClick={() => transfer.mutate()}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Record transfer
            </Button>
            {!can("receiveStock") && (
              <p className="text-xs text-muted-foreground">
                Your role cannot move stock — ask a store keeper or manager.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent transfers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(transfers ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="numeric">
                      {t.plates?.plate_code ?? t.offcuts?.offcut_code ?? "—"}
                    </TableCell>
                    <TableCell className="capitalize">{t.item_type}</TableCell>
                    <TableCell>{warehouseName(t.from_warehouse_id)}</TableCell>
                    <TableCell>{warehouseName(t.to_warehouse_id)}</TableCell>
                    <TableCell className="numeric">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
                {(transfers ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No transfers recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
