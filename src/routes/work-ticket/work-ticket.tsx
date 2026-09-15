import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileUp, RotateCw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { optimiseWorkTicket, type WorkTicketJob } from "@/lib/work-ticket-optimizer";

export const Route = createFileRoute("/work-ticket/work-ticket")({
  head: () => ({ meta: [{ title: "Work Ticket Optimiser — PlateWorks" }] }),
  component: WorkTicket,
});

type Mapping = { jobNumber: string; itemName: string; description: string; length: string; width: string; quantity: string };
const EMPTY_MAPPING: Mapping = { jobNumber: "", itemName: "", description: "", length: "", width: "", quantity: "" };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function detect(headers: string[], candidates: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return "";
}

function numberValue(value: string | undefined) {
  if (!value) return 0;
  const cleaned = String(value).replace(/,/g, "").replace(/[^0-9.+-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function WorkTicket() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [plateLength, setPlateLength] = useState("42");
  const [plateWidth, setPlateWidth] = useState("60");
  const [saved, setSaved] = useState(false);

  const jobs = useMemo<WorkTicketJob[]>(() => records.map((row, i) => ({
    id: `${row[mapping.jobNumber] ?? "job"}-${i}`,
    workTicketId: `${row[mapping.jobNumber] ?? "job"}-${i}`,
    workTicketNumber: row[mapping.jobNumber] || `JOB-${i + 1}`,
    itemName: row[mapping.itemName] || "Unnamed item",
    description: row[mapping.description] || "",
    length: numberValue(row[mapping.length]),
    width: numberValue(row[mapping.width]),
    quantity: Math.max(1, Math.floor(numberValue(row[mapping.quantity]) || 1)),
  })).filter((j) => j.length > 0 && j.width > 0), [records, mapping]);

  const result = useMemo(() => optimiseWorkTicket(jobs, numberValue(plateLength), numberValue(plateWidth)), [jobs, plateLength, plateWidth]);
  const plateArea = numberValue(plateLength) * numberValue(plateWidth);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { toast.error("The CSV does not contain any line items."); return; }
    const nextHeaders = rows[0].map((h) => h.trim());
    const nextRecords = rows.slice(1).map((r) => Object.fromEntries(nextHeaders.map((h, i) => [h, (r[i] ?? "").trim()])));
    setHeaders(nextHeaders);
    setRecords(nextRecords);
    setMapping({
      jobNumber: detect(nextHeaders, ["SalesOrder Number", "Job Number", "Sales Order Number"]),
      itemName: detect(nextHeaders, ["Item Name", "Item", "Product"]),
      description: detect(nextHeaders, ["Item Desc", "Description"]),
      length: detect(nextHeaders, ["Item.CF.Length", "Length", "Item Length"]),
      width: detect(nextHeaders, ["Item.CF.Width", "Width", "Item Width"]),
      quantity: detect(nextHeaders, ["QuantityOrdered", "Quantity", "Qty"]),
    });
    setSaved(false);
    toast.success(`${nextRecords.length} Work Ticket line items loaded.`);
  };

  const setMap = (key: keyof Mapping, value: string) => setMapping((m) => ({ ...m, [key]: value }));
  const mapOptions = (key: keyof Mapping, label: string, required = true) => (
    <div className="space-y-2">
      <Label>{label}{required ? " *" : ""}</Label>
      <Select value={mapping[key] || "__none__"} onValueChange={(v) => setMap(key, v === "__none__" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="Select CSV field" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Not mapped</SelectItem>
          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return <div className="space-y-6">
    <PageHeader title="Work Ticket Optimiser" description="Upload a Work Ticket, map its Item Fields, select a plate and optimise multiple jobs on the plate." />

    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">1. Upload Work Ticket CSV</CardTitle></CardHeader>
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center hover:bg-muted/40">
            <FileUp className="mb-2 h-8 w-8" />
            <span className="font-medium">Choose Work Ticket CSV</span>
            <span className="mt-1 text-sm text-muted-foreground">Supports the attached Zoho Sales Order format and other CSV layouts.</span>
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => handleUpload(e.target.files?.[0])} />
          </label>
          {records.length > 0 && <p className="mt-3 text-sm text-muted-foreground">Loaded <b>{records.length}</b> rows and detected <b>{headers.length}</b> fields.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Plate Dimensions</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="space-y-2"><Label>Plate Length</Label><Input type="number" min="0" step="0.01" value={plateLength} onChange={(e) => setPlateLength(e.target.value)} /></div>
          <div className="space-y-2"><Label>Plate Width</Label><Input type="number" min="0" step="0.01" value={plateWidth} onChange={(e) => setPlateWidth(e.target.value)} /></div>
          <div className="rounded-md bg-muted p-3 text-sm"><div>Plate Area</div><div className="text-xl font-semibold">{plateArea.toLocaleString()} in²</div></div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-base">3. Map Item Fields</CardTitle><p className="text-sm text-muted-foreground">Length and Width default to the Zoho Item custom fields <b>Item.CF.Length</b> and <b>Item.CF.Width</b>.</p></div><Settings2 className="h-5 w-5 text-muted-foreground" /></CardHeader>
      <CardContent>
        {headers.length === 0 ? <p className="text-sm text-muted-foreground">Upload a CSV first to map its fields.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mapOptions("jobNumber", "Job / Sales Order Number")}
          {mapOptions("itemName", "Item Name")}
          {mapOptions("description", "Description", false)}
          {mapOptions("length", "Length — Item.CF.Length")}
          {mapOptions("width", "Width — Item.CF.Width")}
          {mapOptions("quantity", "Quantity")}
          <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between rounded-md border p-3"><div className="text-sm"><b>Mapped fields:</b> {mapping.length || "—"} × {mapping.width || "—"} · Qty: {mapping.quantity || "—"}</div><Button variant="outline" onClick={() => { localStorage.setItem("plateworks-work-ticket-mapping", JSON.stringify(mapping)); setSaved(true); }}><Save className="mr-2 h-4 w-4" />{saved ? "Mapping Saved" : "Save Mapping"}</Button></div>
        </div>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="text-base">4. Recommended Jobs</CardTitle></CardHeader>
      <CardContent>
        {result.recommendations.length === 0 ? <p className="text-sm text-muted-foreground">Map Length, Width and Quantity to see recommendations.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Item</TableHead><TableHead>Dimensions</TableHead><TableHead>Qty</TableHead><TableHead>Area Each</TableHead><TableHead>Recommended</TableHead><TableHead>Orientation</TableHead><TableHead>Fit</TableHead></TableRow></TableHeader><TableBody>{result.recommendations.map((r) => <TableRow key={r.job.id}><TableCell className="font-medium">{r.job.workTicketNumber}</TableCell><TableCell>{r.job.itemName}</TableCell><TableCell>{r.job.length} × {r.job.width}</TableCell><TableCell>{r.requestedQuantity}</TableCell><TableCell>{r.areaEach.toLocaleString()} in²</TableCell><TableCell>{r.recommendedQuantity}</TableCell><TableCell>{r.orientation === "rotated" ? <span className="inline-flex items-center gap-1"><RotateCw className="h-3 w-3" /> Rotated</span> : "Normal"}</TableCell><TableCell>{r.fits ? <Badge>Fits</Badge> : <Badge variant="destructive">Does not fit</Badge>}</TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[['Total Job Area', `${result.selectedArea.toLocaleString()} in²`], ['Plate Area', `${result.totalPlateArea.toLocaleString()} in²`], ['Wastage', `${result.wastage.toLocaleString()} in²`], ['Utilisation', `${result.utilisation.toFixed(1)}%`]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div>{label === 'Utilisation' && <Progress className="mt-3" value={result.utilisation} />}</CardContent></Card>)}
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base">5. Plate Layout</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {result.plates.length === 0 ? <p className="text-sm text-muted-foreground">No jobs can currently be placed on the selected plate.</p> : result.plates.map((plate) => <div key={plate.plateNumber} className="space-y-2"><div className="flex items-center justify-between text-sm"><b>Plate {plate.plateNumber}</b><span>{plate.usedArea.toLocaleString()} / {plate.area.toLocaleString()} in² · {plate.utilisation.toFixed(1)}% used · {plate.wastage.toLocaleString()} in² wastage</span></div><div className="relative aspect-[42/60] max-w-xl overflow-hidden rounded-md border bg-muted/30" style={{ aspectRatio: `${plate.length}/${plate.width}` }}>{plate.placements.map((p) => <div key={`${p.jobId}-${p.index}`} className="absolute overflow-hidden rounded-sm border bg-background/90 p-1 text-[10px]" style={{ left: `${(p.x / plate.length) * 100}%`, top: `${(p.y / plate.width) * 100}%`, width: `${(p.length / plate.length) * 100}%`, height: `${(p.width / plate.width) * 100}%` }} title={`${p.workTicketNumber} — ${p.itemName} — ${p.length} × ${p.width}`}><span className="font-medium">{p.workTicketNumber}</span><br />{p.length} × {p.width}</div>)}</div></div>)}
        {result.unallocatedQuantity > 0 && <p className="text-sm text-amber-600">{result.unallocatedQuantity} job pieces remain unallocated. Increase plate count/dimensions or create another plate plan.</p>}
      </CardContent>
    </Card>
  </div>;
}
