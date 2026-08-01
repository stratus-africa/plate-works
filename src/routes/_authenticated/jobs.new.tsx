import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { CuttingLayoutPreview } from "@/components/cutting-layout-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MASTER_PLATE_HEIGHT,
  MASTER_PLATE_WIDTH,
  findBestOffcut,
  optimizeJob,
} from "@/lib/optimizer";
import { defaultMachine, useMachines } from "@/lib/machines";
import { audit, notify } from "@/lib/data";
import { useAuth } from "@/lib/auth";


export const Route = createFileRoute("/_authenticated/jobs/new")({
  head: () => ({
    meta: [
      { title: "New Production Job — PlateWorks" },
      { name: "description", content: "Create a job and calculate plate requirements with live optimisation." },
    ],
  }),
  component: NewJob,
});

const schema = z.object({
  customer_id: z.string().uuid("Select a customer"),
  product: z.string().trim().min(2, "Product is required").max(120),
  sales_order: z.string().trim().max(40).optional(),
  artwork_width: z.coerce.number().positive().max(200),
  artwork_height: z.coerce.number().positive().max(200),
  quantity: z.coerce.number().int().positive().max(100000),
  margin_top: z.coerce.number().min(0).max(20),
  margin_bottom: z.coerce.number().min(0).max(20),
  margin_left: z.coerce.number().min(0).max(20),
  margin_right: z.coerce.number().min(0).max(20),
  colours: z.coerce.number().int().min(1).max(12),
  due_date: z.string().optional(),
});

function NewJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const [form, setForm] = useState({
    customer_id: "",
    product: "",
    sales_order: "",
    artwork_width: "18",
    artwork_height: "25",
    quantity: "4",
    margin_top: "1",
    margin_bottom: "1",
    margin_left: "1",
    margin_right: "1",
    colours: "4",
    due_date: "",
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await supabase.from("customers").select("id,company").order("company")).data ?? [],
  });

  const { data: offcuts } = useQuery({
    queryKey: ["offcuts-available"],
    queryFn: async () =>
      (
        await supabase
          .from("offcuts")
          .select("id,offcut_code,width,height,area")
          .eq("status", "available")
      ).data ?? [],
  });

  const effWidth =
    Number(form.artwork_width || 0) + Number(form.margin_left || 0) + Number(form.margin_right || 0);
  const effHeight =
    Number(form.artwork_height || 0) + Number(form.margin_top || 0) + Number(form.margin_bottom || 0);

  const opt = useMemo(
    () => optimizeJob(effWidth, effHeight, Number(form.quantity || 1)),
    [effWidth, effHeight, form.quantity],
  );

  const suitableOffcut = useMemo(
    () =>
      findBestOffcut(
        (offcuts ?? []).map((o) => ({ ...o, area: Number(o.area ?? 0) })),
        effWidth,
        effHeight,
      ),
    [offcuts, effWidth, effHeight],
  );

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          ...parsed,
          sales_order: parsed.sales_order || null,
          due_date: parsed.due_date || null,
          operator_id: user?.id ?? null,
          created_by: user?.id ?? null,
          status: "pending",
          plates_required: opt.platesRequired,
          pieces_per_plate: opt.piecesPerPlate,
          rotated: opt.rotated,
          utilization: Number(opt.utilization.toFixed(2)),
          waste_area: Number(opt.totalWasteArea.toFixed(2)),
        })
        .select()
        .single();
      if (error) throw error;
      await notify(
        "Job created",
        `${data.job_number} requires ${opt.platesRequired} plate(s) at ${opt.utilization.toFixed(1)}% utilisation.`,
        "info",
        "production",
      );
      if (!suitableOffcut) {
        await notify(
          "No suitable offcut",
          `${data.job_number} will consume new plates — no offcut fits ${effWidth}" × ${effHeight}".`,
          "warning",
          "inventory",
        );
      }
      await audit("create_job", "jobs", data.id, null, data);
      return data;
    },
    onSuccess: (job) => {
      toast.success(`${job.job_number} created`);
      queryClient.invalidateQueries();
      navigate({ to: "/jobs/$jobId", params: { jobId: job.id } });
    },
    onError: (err) =>
      toast.error(err instanceof z.ZodError ? err.issues[0].message : (err as Error).message),
  });

  if (!can("createJobs")) {
    return <PageHeader title="New Job" description="You do not have permission to create jobs." />;
  }

  const num = (key: keyof typeof form, label: string, step = "0.25") => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="New Production Job"
        description="Calculations update live as you type. Offcuts are searched before new plates."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sales order</Label>
                <Input
                  value={form.sales_order}
                  onChange={(e) => setForm((f) => ({ ...f, sales_order: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Product</Label>
                <Input
                  value={form.product}
                  onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  placeholder="e.g. Cereal carton — front panel"
                />
              </div>
              {num("artwork_width", "Artwork width (in)")}
              {num("artwork_height", "Artwork height (in)")}
              {num("quantity", "Quantity", "1")}
              {num("colours", "Number of colours", "1")}
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Margins</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              {num("margin_top", "Top")}
              {num("margin_bottom", "Bottom")}
              {num("margin_left", "Left")}
              {num("margin_right", "Right")}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cutting layout preview</CardTitle>
            </CardHeader>
            <CardContent>
              {opt.fits ? (
                <CuttingLayoutPreview
                  layout={opt}
                  plateWidth={MASTER_PLATE_WIDTH}
                  plateHeight={MASTER_PLATE_HEIGHT}
                />
              ) : (
                <p className="text-sm text-destructive">
                  The effective size does not fit inside the {opt.usableWidth.toFixed(2)}" ×{" "}
                  {opt.usableHeight.toFixed(2)}" nestable area of a 42" × 60" master plate (after the{" "}
                  {CLAMP_MARGIN}" clamp margin on every edge).
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="kpi-surface">
            <CardHeader>
              <CardTitle className="text-base">Live calculation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Effective plate size" value={`${effWidth.toFixed(2)}" × ${effHeight.toFixed(2)}"`} strong />
              <Row label="Master plate" value={'42" × 60"'} />
              <Row label="Clamp margin (per edge)" value={`${CLAMP_MARGIN}"`} />
              <Row
                label="Nestable area"
                value={`${opt.usableWidth.toFixed(2)}" × ${opt.usableHeight.toFixed(2)}"`}
              />
              <Row label="Across × down" value={`${opt.across} × ${opt.down}`} />

              <Row label="Pieces per plate" value={String(opt.piecesPerPlate)} strong />
              <Row label="Plates required" value={String(opt.platesRequired)} strong />
              <Row label="Material utilisation" value={`${opt.utilization.toFixed(1)}%`} />
              <Row label="Waste per plate" value={`${opt.wastePercent.toFixed(1)}%`} />
              <Row label="Total waste" value={`${Math.round(opt.totalWasteArea).toLocaleString()} in²`} />
              {opt.rotated && (
                <Badge variant="secondary" className="gap-1">
                  <RotateCw className="h-3 w-3" /> Rotated 90° for best fit
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Offcut search</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {suitableOffcut ? (
                <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                  <div>
                    <p className="font-medium">Suitable offcut found</p>
                    <p className="text-muted-foreground">
                      {suitableOffcut.offcut_code} — {Number(suitableOffcut.width).toFixed(1)}" ×{" "}
                      {Number(suitableOffcut.height).toFixed(1)}". It will be reserved before opening a
                      new plate.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                  <div>
                    <p className="font-medium">No suitable offcut available</p>
                    <p className="text-muted-foreground">New master plates will be reserved.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            disabled={create.isPending || !opt.fits}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create job"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "numeric font-semibold" : "numeric"}>{value}</span>
    </div>
  );
}
