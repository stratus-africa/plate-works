import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { audit, logTransaction, notify } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/inventory/receive")({
  head: () => ({
    meta: [
      { title: "Receive Stock — PlateWorks" },
      { name: "description", content: "Receive plate boxes and convert them into individually tracked plates." },
    ],
  }),
  component: ReceiveStock,
});

const schema = z.object({
  batch_number: z.string().trim().min(3, "Batch number is required").max(40),
  manufacturer_id: z.string().uuid("Select a manufacturer"),
  supplier_id: z.string().uuid().optional().or(z.literal("")),
  warehouse_id: z.string().uuid("Select a warehouse"),
  plate_type: z.string().trim().min(1).max(40),
  thickness: z.coerce.number().min(0).max(10),
  boxes_received: z.coerce.number().int().min(1).max(500),
  pieces_per_box: z.coerce.number().int().min(1).max(50),
  cost_per_plate: z.coerce.number().min(0).max(1000000),
  purchase_order: z.string().trim().max(40).optional(),
});

function ReceiveStock() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState({
    batch_number: `BTH-${Date.now().toString().slice(-6)}`,
    manufacturer_id: "",
    supplier_id: "",
    warehouse_id: "",
    plate_type: "CTP Thermal",
    thickness: "0.30",
    boxes_received: "25",
    pieces_per_box: "8",
    cost_per_plate: "0",
    purchase_order: "",
  });

  const { data: refs } = useQuery({
    queryKey: ["receive-refs"],
    queryFn: async () => {
      const [m, s, w] = await Promise.all([
        supabase.from("manufacturers").select("id,name").order("name"),
        supabase.from("suppliers").select("id,name").order("name"),
        supabase.from("warehouses").select("id,name").order("name"),
      ]);
      return { manufacturers: m.data ?? [], suppliers: s.data ?? [], warehouses: w.data ?? [] };
    },
  });

  const totalPlates = Number(form.boxes_received || 0) * Number(form.pieces_per_box || 0);

  const receive = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      const total = parsed.boxes_received * parsed.pieces_per_box;
      const { data: userData } = await supabase.auth.getUser();

      const { data: batch, error } = await supabase
        .from("plate_batches")
        .insert({
          batch_number: parsed.batch_number,
          manufacturer_id: parsed.manufacturer_id,
          supplier_id: parsed.supplier_id || null,
          warehouse_id: parsed.warehouse_id,
          plate_type: parsed.plate_type,
          thickness: parsed.thickness,
          boxes_received: parsed.boxes_received,
          pieces_per_box: parsed.pieces_per_box,
          total_plates: total,
          available_plates: total,
          cost_per_plate: parsed.cost_per_plate,
          purchase_order: parsed.purchase_order || null,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Boxes are converted into individually tracked plates (PLT-XXXXXX).
      const plateRows = Array.from({ length: total }).map(() => ({
        batch_id: batch.id,
        width: batch.plate_width,
        height: batch.plate_height,
        remaining_area: Number(batch.plate_width) * Number(batch.plate_height),
        warehouse_id: parsed.warehouse_id,
      }));
      for (let i = 0; i < plateRows.length; i += 200) {
        const { error: plateError } = await supabase.from("plates").insert(plateRows.slice(i, i + 200));
        if (plateError) throw plateError;
      }

      await logTransaction({
        transaction_type: "receipt",
        quantity: total,
        batch_id: batch.id,
        warehouse_id: parsed.warehouse_id,
        reference: parsed.batch_number,
        notes: `${parsed.boxes_received} boxes × ${parsed.pieces_per_box} pieces`,
      });
      await notify(
        "Stock received",
        `${total} plates added under batch ${parsed.batch_number}.`,
        "success",
        "inventory",
      );
      await audit("receive_stock", "plate_batches", batch.id, null, batch);
      return batch;
    },
    onSuccess: () => {
      toast.success("Stock received and plates generated");
      queryClient.invalidateQueries();
      navigate({ to: "/inventory" });
    },
    onError: (err) =>
      toast.error(err instanceof z.ZodError ? err.issues[0].message : (err as Error).message),
  });

  if (!can("receiveStock")) {
    return <PageHeader title="Receive Stock" description="You do not have permission to receive stock." />;
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div>
      <PageHeader
        title="Receive Stock"
        description="Boxes are automatically converted into individual plates with unique IDs."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Batch details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Batch number</Label>
              <Input {...field("batch_number")} />
            </div>
            <div className="space-y-2">
              <Label>Manufacturer</Label>
              <Select
                value={form.manufacturer_id}
                onValueChange={(v) => setForm((f) => ({ ...f, manufacturer_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  {refs?.manufacturers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={form.supplier_id}
                onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {refs?.suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <Select
                value={form.warehouse_id}
                onValueChange={(v) => setForm((f) => ({ ...f, warehouse_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {refs?.warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plate type</Label>
              <Input {...field("plate_type")} />
            </div>
            <div className="space-y-2">
              <Label>Thickness (mm)</Label>
              <Input type="number" step="0.01" {...field("thickness")} />
            </div>
            <div className="space-y-2">
              <Label>Boxes received</Label>
              <Input type="number" {...field("boxes_received")} />
            </div>
            <div className="space-y-2">
              <Label>Pieces per box</Label>
              <Select
                value={form.pieces_per_box}
                onValueChange={(v) => setForm((f) => ({ ...f, pieces_per_box: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["8", "10", "12"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v} plates
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cost per plate</Label>
              <Input type="number" step="0.01" {...field("cost_per_plate")} />
            </div>
            <div className="space-y-2">
              <Label>Purchase order</Label>
              <Input {...field("purchase_order")} />
            </div>
          </CardContent>
        </Card>

        <Card className="kpi-surface h-fit">
          <CardHeader>
            <CardTitle className="text-base">Conversion summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Plate size" value={'42" × 60"'} />
            <Row label="Boxes" value={form.boxes_received || "0"} />
            <Row label="Pieces per box" value={form.pieces_per_box} />
            <Row label="Total individual plates" value={totalPlates.toLocaleString()} strong />
            <Row
              label="Stock value"
              value={(totalPlates * Number(form.cost_per_plate || 0)).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            />
            <Button
              className="mt-2 w-full"
              disabled={receive.isPending || totalPlates === 0}
              onClick={() => receive.mutate()}
            >
              {receive.isPending ? "Generating plates…" : `Receive ${totalPlates} plates`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "numeric text-lg font-semibold" : "numeric"}>{value}</span>
    </div>
  );
}
