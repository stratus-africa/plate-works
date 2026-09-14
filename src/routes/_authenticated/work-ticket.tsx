import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { WorkTicketLayoutPreview } from "@/components/work-ticket-layout-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildPlan, parseWorkTicketCsv, recommendJobs, type WorkTicketJob } from "@/lib/work-ticket-optimizer";

export const Route = createFileRoute("/_authenticated/work-ticket")({
  head: () => ({ meta: [{ title: "Work Ticket Optimiser — PlateWorks" }] }),
  component: WorkTicket,
});

function WorkTicket() {
  const [plateLength, setPlateLength] = useState("60");
  const [plateWidth, setPlateWidth] = useState("42");
  const [jobs, setJobs] = useState<WorkTicketJob[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState("");

  const plateW = Number(plateWidth) || 0;
  const plateH = Number(plateLength) || 0;

  const recommended = useMemo(() => recommendJobs(jobs, plateW, plateH), [jobs, plateW, plateH]);
  const selectedJobs = useMemo(() => jobs.map((job) => ({ ...job, quantity: selected[job.id] ?? 0 })).filter((job) => job.quantity > 0), [jobs, selected]);
  const plan = useMemo(() => buildPlan(selectedJobs, plateW, plateH), [selectedJobs, plateW, plateH]);

  function applyRecommendations() {
    const next: Record<string, number> = {};
    for (const r of recommended) if (r.recommendedQuantity > 0) next[r.id] = r.recommendedQuantity;
    setSelected(next);
    toast.success("Best-fit job recommendation applied to the selected plate.");
  }

  async function handleCsv(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseWorkTicketCsv(text);
      setJobs(parsed);
      const initial: Record<string, number> = {};
      parsed.forEach((j) => { initial[j.id] = 0; });
      setSelected(initial);
      setFileName(file.name);
      toast.success(`${parsed.length} line item(s) loaded from ${file.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read the CSV.");
    }
  }

  function updateQuantity(id: string, value: string) {
    const job = jobs.find((j) => j.id === id);
    const max = job?.quantity ?? 0;
    const qty = Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
    setSelected((current) => ({ ...current, [id]: qty }));
  }

  return (
    <div>
      <PageHeader title="Work Ticket Optimiser" description="Load a Work Ticket, choose the plate you are working with, then build the best combination of jobs on that plate." />

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Step 1 — Load Plate Dimensions</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Plate Length</Label><Input type="number" min="0" step="0.01" value={plateLength} onChange={(e) => setPlateLength(e.target.value)} /></div>
            <div className="space-y-2"><Label>Plate Width</Label><Input type="number" min="0" step="0.01" value={plateWidth} onChange={(e) => setPlateWidth(e.target.value)} /></div>
            <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Plate Area</p><p className="numeric text-xl font-semibold">{plan.plateArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} in²</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2 — Upload Work Ticket CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 hover:bg-muted/40">
              <FileUp className="h-5 w-5" />
              <span className="text-sm"><strong>Choose CSV</strong> containing Length and Width for every line item{fileName ? ` — ${fileName}` : ""}</span>
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => handleCsv(e.target.files?.[0])} />
            </label>
            <p className="text-xs text-muted-foreground">Recommended columns: Job Number, Description, Length, Width, Quantity. Length/Width are checked in both orientations.</p>
          </CardContent>
        </Card>

        {jobs.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Step 2 — Recommended Jobs</CardTitle>
              <Button onClick={applyRecommendations}>Apply Best Fit</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Use</TableHead><TableHead>Job</TableHead><TableHead>Description</TableHead><TableHead>L × W</TableHead><TableHead>Available</TableHead><TableHead>Recommended</TableHead><TableHead>Area / piece</TableHead><TableHead>Fit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recommended.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><Checkbox checked={(selected[r.id] ?? 0) > 0} onCheckedChange={(checked) => updateQuantity(r.id, checked ? String(Math.max(1, r.recommendedQuantity)) : "0")} /></TableCell>
                      <TableCell className="font-medium">{r.jobNumber}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell className="numeric">{r.length} × {r.width}</TableCell>
                      <TableCell className="numeric">{r.quantity}</TableCell>
                      <TableCell><Input className="w-24" type="number" min="0" max={r.quantity} value={selected[r.id] ?? 0} onChange={(e) => updateQuantity(r.id, e.target.value)} /></TableCell>
                      <TableCell className="numeric">{r.area.toLocaleString(undefined, { maximumFractionDigits: 2 })} in²</TableCell>
                      <TableCell><Badge variant={r.fit === "fits" ? "default" : r.fit === "partial" ? "secondary" : "destructive"}>{r.fit}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {jobs.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader><CardTitle className="text-base">Step 3 — Plate Layout</CardTitle></CardHeader>
              <CardContent><WorkTicketLayoutPreview plan={plan} /></CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="kpi-surface">
                <CardHeader><CardTitle className="text-base">Plate Calculation</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Metric label="Plate dimensions" value={`${plateLength || 0} × ${plateWidth || 0} in`} />
                  <Metric label="Plate area" value={`${plan.plateArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} in²`} strong />
                  <Metric label="Total area — selected jobs" value={`${plan.totalArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} in²`} strong />
                  <Metric label="Wastage" value={`${plan.wastage.toLocaleString(undefined, { maximumFractionDigits: 2 })} in²`} />
                  <Metric label="Utilisation" value={`${plan.utilisation.toFixed(1)}%`} strong />
                  <Metric label="Wastage %" value={`${plan.wastagePercent.toFixed(1)}%`} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Selected Line Items</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {selectedJobs.length === 0 ? <p className="text-sm text-muted-foreground">Select jobs above or click Apply Best Fit.</p> : selectedJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{job.jobNumber} — {job.quantity} pcs</span>
                      <span className="numeric">{(job.length * job.width * job.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} in²</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Button variant="outline" className="w-full" onClick={() => { setJobs([]); setSelected({}); setFileName(""); }} disabled={jobs.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear Work Ticket
              </Button>
            </div>
          </div>
        )}

        {jobs.length === 0 && <Card><CardContent className="py-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No Work Ticket loaded</p><p className="mt-1 text-sm text-muted-foreground">Upload a CSV above to start recommending jobs for the selected plate.</p></CardContent></Card>}
      </div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between border-b pb-2 last:border-0"><span className="text-muted-foreground">{label}</span><span className={strong ? "numeric font-semibold" : "numeric"}>{value}</span></div>;
}
