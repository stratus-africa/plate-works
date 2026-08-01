import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Layers, PlayCircle, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CuttingLayoutPreview } from "@/components/cutting-layout-preview";
import { AiLayoutRecommendation } from "@/components/ai-layout-recommendation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MASTER_PLATE_HEIGHT,
  MASTER_PLATE_WIDTH,
  CLAMP_MARGIN,
  MASTER_PLATE_HEIGHT,
  MASTER_PLATE_WIDTH,
  findBestOffcut,
  optimizeJob,
} from "@/lib/optimizer";
import { audit, logTransaction, notify } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Job Detail — PlateWorks" },
      { name: "description", content: "Plate allocation, cutting layout and production completion for a job." },
    ],
  }),
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, customers(company, contact_person)")
        .eq("id", jobId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: allocations } = useQuery({
    queryKey: ["allocations", jobId],
    queryFn: async () =>
      (
        await supabase
          .from("plate_allocations")
          .select("*, plates(plate_code, batch_id), offcuts(offcut_code, width, height)")
          .eq("job_id", jobId)
      ).data ?? [],
  });

  const allocate = useMutation({
    mutationFn: async () => {
      if (!job) return;
      const effW = Number(job.effective_width);
      const effH = Number(job.effective_height);
      const clamp = Number(job.clamp_margin ?? CLAMP_MARGIN);
      const opt = optimizeJob(effW, effH, job.quantity, MASTER_PLATE_WIDTH, MASTER_PLATE_HEIGHT, clamp);

      // 1. Search available offcuts BEFORE opening a new plate.
      const { data: offcutRows } = await supabase
        .from("offcuts")
        .select("id,offcut_code,width,height,area")
        .eq("status", "available");
      const candidate = findBestOffcut(
        (offcutRows ?? []).map((o) => ({ ...o, area: Number(o.area ?? 0) })),
        effW,
        effH,
        clamp,
      );

      if (candidate && opt.platesRequired === 1) {
        await supabase.from("offcuts").update({ status: "reserved" }).eq("id", candidate.id);
        await supabase.from("plate_allocations").insert({
          job_id: job.id,
          offcut_id: candidate.id,
          source: "offcut",
          pieces_placed: job.quantity,
          used_area: effW * effH * job.quantity,
          waste_area: Math.max(candidate.area - effW * effH * job.quantity, 0),
        });
        await logTransaction({
          transaction_type: "reservation",
          quantity: 1,
          offcut_id: candidate.id,
          job_id: job.id,
          reference: job.job_number,
          notes: `Offcut ${candidate.offcut_code} reserved instead of a new plate`,
        });
        await notify(
          "Offcut allocated",
          `${candidate.offcut_code} reserved for ${job.job_number}, saving one master plate.`,
          "success",
          "inventory",
        );
      } else {
        // 2. FIFO reservation of new master plates.
        const { data: plates, error } = await supabase
          .from("plates")
          .select("id,plate_code,batch_id,area")
          .eq("status", "available")
          .order("created_at", { ascending: true })
          .limit(opt.platesRequired);
        if (error) throw error;
        if (!plates || plates.length < opt.platesRequired) {
          await notify(
            "Insufficient plate stock",
            `${job.job_number} needs ${opt.platesRequired} plates, only ${plates?.length ?? 0} available.`,
            "critical",
            "inventory",
          );
          throw new Error(
            `Only ${plates?.length ?? 0} plates available — ${opt.platesRequired} required.`,
          );
        }

        await supabase
          .from("plates")
          .update({ status: "reserved" })
          .in(
            "id",
            plates.map((p) => p.id),
          );

        const pieceArea = effW * effH;
        await supabase.from("plate_allocations").insert(
          plates.map((p, i) => {
            const pieces =
              i === plates.length - 1 ? opt.piecesOnLastPlate : opt.piecesPerPlate;
            return {
              job_id: job.id,
              plate_id: p.id,
              source: "plate",
              pieces_placed: pieces,
              used_area: pieces * pieceArea,
              waste_area: Number(p.area) - pieces * pieceArea,
            };
          }),
        );

        // Update batch reservation counters.
        const batchCounts = plates.reduce<Record<string, number>>((acc, p) => {
          acc[p.batch_id] = (acc[p.batch_id] ?? 0) + 1;
          return acc;
        }, {});
        for (const [batchId, count] of Object.entries(batchCounts)) {
          const { data: batch } = await supabase
            .from("plate_batches")
            .select("available_plates,reserved_plates")
            .eq("id", batchId)
            .single();
          if (batch) {
            await supabase
              .from("plate_batches")
              .update({
                available_plates: batch.available_plates - count,
                reserved_plates: batch.reserved_plates + count,
              })
              .eq("id", batchId);
          }
        }

        await logTransaction({
          transaction_type: "reservation",
          quantity: plates.length,
          job_id: job.id,
          reference: job.job_number,
          notes: "New master plates reserved (FIFO)",
        });
      }

      await supabase.from("jobs").update({ status: "approved" }).eq("id", job.id);
      await audit("allocate_plates", "jobs", job.id, { status: job.status }, { status: "approved" });
    },
    onSuccess: () => {
      toast.success("Plates allocated and job approved");
      queryClient.invalidateQueries();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const start = useMutation({
    mutationFn: async () => {
      await supabase.from("jobs").update({ status: "in_production" }).eq("id", jobId);
    },
    onSuccess: () => {
      toast.success("Job moved to production");
      queryClient.invalidateQueries();
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      if (!job) return;
      const effW = Number(job.effective_width);
      const effH = Number(job.effective_height);
      const clamp = Number(job.clamp_margin ?? CLAMP_MARGIN);
      const opt = optimizeJob(effW, effH, job.quantity, MASTER_PLATE_WIDTH, MASTER_PLATE_HEIGHT, clamp);

      const { data: allocs } = await supabase
        .from("plate_allocations")
        .select("*, plates(id, area, batch_id, warehouse_id)")
        .eq("job_id", job.id);

      for (const alloc of allocs ?? []) {
        if (alloc.plate_id && alloc.plates) {
          // Consume the plate and generate reusable offcuts from the layout.
          await supabase
            .from("plates")
            .update({ status: "fully_consumed", remaining_area: 0 })
            .eq("id", alloc.plate_id);

          const newOffcuts = opt.offcuts
            .filter((o) => o.width >= 4 && o.height >= 4)
            .map((o) => ({
              parent_plate_id: alloc.plate_id,
              job_id: job.id,
              width: Number(o.width.toFixed(2)),
              height: Number(o.height.toFixed(2)),
              shape: "rectangle",
              warehouse_id: alloc.plates?.warehouse_id ?? null,
            }));
          if (newOffcuts.length) await supabase.from("offcuts").insert(newOffcuts);

          const { data: batch } = await supabase
            .from("plate_batches")
            .select("reserved_plates,used_plates")
            .eq("id", alloc.plates.batch_id)
            .single();
          if (batch) {
            await supabase
              .from("plate_batches")
              .update({
                reserved_plates: Math.max(batch.reserved_plates - 1, 0),
                used_plates: batch.used_plates + 1,
              })
              .eq("id", alloc.plates.batch_id);
          }

          await logTransaction({
            transaction_type: "consumption",
            quantity: 1,
            plate_id: alloc.plate_id,
            job_id: job.id,
            reference: job.job_number,
          });
        }

        if (alloc.offcut_id) {
          await supabase.from("offcuts").update({ status: "used" }).eq("id", alloc.offcut_id);
          await logTransaction({
            transaction_type: "offcut_consumption",
            quantity: 1,
            offcut_id: alloc.offcut_id,
            job_id: job.id,
            reference: job.job_number,
          });
        }

        await supabase.from("plate_allocations").update({ consumed: true }).eq("id", alloc.id);
      }

      await supabase
        .from("jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      await notify(
        "Production completed",
        `${job.job_number} completed at ${Number(job.utilization).toFixed(1)}% utilisation.`,
        "success",
        "production",
      );
      await audit("complete_job", "jobs", job.id, { status: job.status }, { status: "completed" });
    },
    onSuccess: () => {
      toast.success("Production completed — inventory updated");
      queryClient.invalidateQueries();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading || !job) return <Skeleton className="h-96 w-full" />;

  const jobClamp = Number(job.clamp_margin ?? CLAMP_MARGIN);
  const opt = optimizeJob(
    Number(job.effective_width),
    Number(job.effective_height),
    job.quantity,
    MASTER_PLATE_WIDTH,
    MASTER_PLATE_HEIGHT,
    jobClamp,
  );

  return (
    <div>
      <PageHeader
        title={job.job_number}
        description={`${job.product} · ${job.customers?.company ?? "No customer"}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            {job.status === "pending" && can("approveJobs") && (
              <Button onClick={() => allocate.mutate()} disabled={allocate.isPending}>
                <Layers className="mr-2 h-4 w-4" /> Allocate & approve
              </Button>
            )}
            {job.status === "approved" && can("recordProduction") && (
              <Button onClick={() => start.mutate()} disabled={start.isPending}>
                <PlayCircle className="mr-2 h-4 w-4" /> Start production
              </Button>
            )}
            {job.status === "in_production" && can("recordProduction") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Complete production
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Complete production?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Allocated plates will be consumed, new offcuts generated and inventory updated.
                      This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => complete.mutate()}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cutting layout</CardTitle>
          </CardHeader>
          <CardContent>
            <CuttingLayoutPreview
              layout={opt}
              plateWidth={MASTER_PLATE_WIDTH}
              plateHeight={MASTER_PLATE_HEIGHT}
            />
          </CardContent>
        </Card>

        <Card className="kpi-surface">
          <CardHeader>
            <CardTitle className="text-base">Specification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Artwork" value={`${job.artwork_width}" × ${job.artwork_height}"`} />
            <Row
              label="Margins"
              value={`${job.margin_top}/${job.margin_bottom}/${job.margin_left}/${job.margin_right}`}
            />
            <Row
              label="Effective size"
              value={`${Number(job.effective_width).toFixed(2)}" × ${Number(job.effective_height).toFixed(2)}"`}
              strong
            />
            <Row label="Quantity" value={String(job.quantity)} />
            <Row label="Colours" value={String(job.colours)} />
            <Row label="Pieces per plate" value={String(job.pieces_per_plate || opt.piecesPerPlate)} />
            <Row label="Plates required" value={String(job.plates_required || opt.platesRequired)} strong />
            <Row label="Utilisation" value={`${Number(job.utilization).toFixed(1)}%`} />
            <Row label="Rotated" value={job.rotated ? "Yes (90°)" : "No"} />
            <Row label="Due date" value={job.due_date ?? "—"} />
            <Row label="Sales order" value={job.sales_order ?? "—"} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <AiLayoutRecommendation
          effectiveWidth={Number(job.effective_width)}
          effectiveHeight={Number(job.effective_height)}
          quantity={job.quantity}
          product={job.product}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          {(allocations ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No material allocated yet. Approving the job reserves an offcut if one fits, otherwise
              new master plates (FIFO).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">Used area</TableHead>
                  <TableHead className="text-right">Waste area</TableHead>
                  <TableHead>Consumed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="capitalize">
                      <span className="flex items-center gap-2">
                        {a.source === "offcut" ? (
                          <Scissors className="h-4 w-4 text-accent" />
                        ) : (
                          <Layers className="h-4 w-4 text-primary" />
                        )}
                        {a.source}
                      </span>
                    </TableCell>
                    <TableCell className="numeric">
                      {a.plates?.plate_code ?? a.offcuts?.offcut_code ?? "—"}
                    </TableCell>
                    <TableCell className="numeric text-right">{a.pieces_placed}</TableCell>
                    <TableCell className="numeric text-right">{Number(a.used_area).toFixed(0)}</TableCell>
                    <TableCell className="numeric text-right">{Number(a.waste_area).toFixed(0)}</TableCell>
                    <TableCell>{a.consumed ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
