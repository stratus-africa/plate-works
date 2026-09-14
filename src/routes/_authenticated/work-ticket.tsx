import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, RefreshCw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { optimiseWorkTicket, type WorkTicketJob } from "@/lib/work-ticket-optimizer";

export const Route = createFileRoute("/_authenticated/work-ticket")({
  head: () => ({ meta: [{ title: "Work Ticket Planning — PlateWorks" }] }),
  component: WorkTicketPlanning,
});

type Mapping = {
  workTicketNumber: string;
  itemName: string;
  description: string;
  length: string;
  width: string;
  quantity: string;
};
const EMPTY_MAPPING: Mapping = {
  workTicketNumber: "",
  itemName: "",
  description: "",
  length: "",
  width: "",
  quantity: "",
};

type TicketRow = {
  id: string;
  work_ticket_id: string;
  source_row_number: number;
  item_name: string;
  description: string | null;
  length: number;
  width: number;
  quantity: number;
  completed_quantity: number;
  status: string;
  work_tickets: { work_ticket_number: string; status: string } | null;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function detect(headers: string[], candidates: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c.toLowerCase());
    if (i >= 0) return headers[i];
  }
  return "";
}
function num(value: unknown) {
  const n = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/[^0-9.+-]/g, ""),
  );
  return Number.isFinite(n) ? n : 0;
}

function WorkTicketPlanning() {
  const queryClient = useQueryClient();
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => {
    if (typeof window === "undefined") return EMPTY_MAPPING;
    try {
      return JSON.parse(window.localStorage.getItem("plateworks-work-ticket-mapping") ?? "null") ?? EMPTY_MAPPING;
    } catch {
      return EMPTY_MAPPING;
    }
  });
  const [plateLength, setPlateLength] = useState("42");
  const [plateWidth, setPlateWidth] = useState("60");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  const { data: openItems = [], isLoading } = useQuery({
    queryKey: ["work-ticket-items", "open-and-partial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_ticket_items")
        .select("*, work_tickets!inner(work_ticket_number,status)")
        .in("status", ["open", "partial"])
        .order("work_ticket_id")
        .order("source_row_number");
      if (error) throw error;
      return (data ?? []) as unknown as TicketRow[];
    },
  });

  const jobs = useMemo<WorkTicketJob[]>(
    () =>
      openItems
        .map((item) => ({
          id: item.id,
          workTicketId: item.work_ticket_id,
          workTicketNumber: item.work_tickets?.work_ticket_number ?? "",
          sourceRowNumber: item.source_row_number,
          itemName: item.item_name,
          description: item.description ?? "",
          length: num(item.length),
          width: num(item.width),
          quantity: item.quantity,
          completedQuantity: item.completed_quantity,
          remainingQuantity: Math.max(0, item.quantity - item.completed_quantity),
        }))
        .filter((j) => j.length > 0 && j.width > 0 && (j.remainingQuantity ?? 0) > 0),
    [openItems],
  );

  const result = useMemo(
    () => optimiseWorkTicket(jobs, num(plateLength), num(plateWidth)),
    [jobs, plateLength, plateWidth],
  );
  const selectedJobs = useMemo(
    () =>
      jobs
        .map((j) => ({ ...j, selectedQuantity: Math.min(selected[j.id] ?? 0, j.remainingQuantity ?? 0) }))
        .filter((j) => j.selectedQuantity > 0),
    [jobs, selected],
  );
  const selectedArea = selectedJobs.reduce((sum, j) => sum + j.length * j.width * j.selectedQuantity, 0);
  const plateArea = num(plateLength) * num(plateWidth);
  const wastage = Math.max(0, plateArea - selectedArea);
  const utilisation = plateArea ? (selectedArea / plateArea) * 100 : 0;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("The CSV does not contain any line items.");
      const nextHeaders = rows[0].map((h) => h.trim());
      const nextRecords = rows
        .slice(1)
        .map((r) => Object.fromEntries(nextHeaders.map((h, i) => [h, (r[i] ?? "").trim()])));
      const nextMapping: Mapping = {
        workTicketNumber: detect(nextHeaders, [
          "SalesOrder Number",
          "Sales Order Number",
          "Work Ticket",
          "Work Ticket Number",
          "SalesOrder",
        ]),
        itemName: detect(nextHeaders, ["Item Name", "Item", "Product"]),
        description: detect(nextHeaders, ["Item Desc", "Description"]),
        length: detect(nextHeaders, ["Item.CF.Length", "Item CF Length", "Length", "Item Length"]),
        width: detect(nextHeaders, ["Item.CF.Width", "Item CF Width", "Width", "Item Width"]),
        quantity: detect(nextHeaders, ["QuantityOrdered", "Quantity Ordered", "Quantity", "Qty"]),
      };
      setHeaders(nextHeaders);
      setRecords(nextRecords);
      setMapping(nextMapping);
      setSaved(false);
      setSelected({});
      return nextRecords.length;
    },
    onSuccess: (n) => toast.success(`${n} CSV rows loaded. Confirm the field mapping, then click Import Work Tickets.`),
    onError: (e) => toast.error((e as Error).message),
  });

  const importMapped = useMutation({
    mutationFn: async () => {
      if (!records.length) throw new Error("Upload a Sales Order CSV first.");
      if (!mapping.workTicketNumber || !mapping.itemName || !mapping.length || !mapping.width || !mapping.quantity) {
        throw new Error("Map Work Ticket, Item Name, Length, Width and Quantity before importing.");
      }
      const groups = new Map<string, Array<{ row: Record<string, string>; rowNumber: number }>>();
      records.forEach((row, i) => {
        const ticketNumber = row[mapping.workTicketNumber] || `Imported CSV — ${i + 1}`;
        const list = groups.get(ticketNumber) ?? [];
        list.push({ row, rowNumber: i + 2 });
        groups.set(ticketNumber, list);
      });
      let imported = 0;
      for (const [ticketNumber, ticketRows] of groups) {
        const existing = await supabase
          .from("work_tickets")
          .select("id")
          .eq("work_ticket_number", ticketNumber)
          .maybeSingle();
        if (existing.error) throw existing.error;
        let ticketId = existing.data?.id;
        if (!ticketId) {
          const inserted = await supabase
            .from("work_tickets")
            .insert({ work_ticket_number: ticketNumber, source_document: "Sales Order CSV", field_mapping: mapping })
            .select("id")
            .single();
          if (inserted.error) throw inserted.error;
          ticketId = inserted.data.id;
        } else {
          const updated = await supabase.from("work_tickets").update({ field_mapping: mapping }).eq("id", ticketId);
          if (updated.error) throw updated.error;
        }
        const existingItems = await supabase
          .from("work_ticket_items")
          .select("source_row_number")
          .eq("work_ticket_id", ticketId);
        if (existingItems.error) throw existingItems.error;
        const existingRows = new Set((existingItems.data ?? []).map((r) => r.source_row_number));
        const inserts = ticketRows
          .map(({ row, rowNumber }) => ({
            work_ticket_id: ticketId!,
            source_row_number: rowNumber,
            item_name: row[mapping.itemName] || "Unnamed item",
            description: mapping.description ? row[mapping.description] || null : null,
            length: num(row[mapping.length]),
            width: num(row[mapping.width]),
            quantity: Math.max(1, Math.floor(num(row[mapping.quantity]) || 1)),
            source_data: row,
          }))
          .filter((r) => !existingRows.has(r.source_row_number) && r.length > 0 && r.width > 0);
        if (inserts.length) {
          const insertedItems = await supabase.from("work_ticket_items").insert(inserts);
          if (insertedItems.error) throw insertedItems.error;
          imported += inserts.length;
        }
        await supabase.rpc("sync_work_ticket_status", { p_work_ticket_id: ticketId });
      }
      return imported;
    },
    onSuccess: (n) => {
      toast.success(`${n} Work Ticket jobs imported. They are now available for planning.`);
      queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const completeSelected = useMutation({
    mutationFn: async () => {
      if (!selectedJobs.length) throw new Error("Select at least one job.");
      if (selectedArea > plateArea) throw new Error("The selected jobs exceed the entered plate area.");
      for (const job of selectedJobs) {
        const completed = Math.min(job.quantity, (job.completedQuantity ?? 0) + job.selectedQuantity);
        const { error } = await supabase
          .from("work_ticket_items")
          .update({ completed_quantity: completed })
          .eq("id", job.id);
        if (error) throw error;
        await supabase.rpc("sync_work_ticket_status", { p_work_ticket_id: job.workTicketId });
      }
    },
    onSuccess: () => {
      toast.success("Selected jobs completed. Work Ticket status was updated automatically.");
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const applyRecommendations = () => {
    // Use the physically packed first plate, not area alone, so the recommended selection cannot overlap.
    const firstPlate = result.plates[0];
    if (!firstPlate) {
      setSelected({});
      return;
    }
    const counts: Record<string, number> = {};
    for (const placement of firstPlate.placements) counts[placement.jobId] = (counts[placement.jobId] ?? 0) + 1;
    setSelected(counts);
  };
  const setQty = (id: string, value: string) =>
    setSelected((s) => ({
      ...s,
      [id]: Math.max(0, Math.min(Math.floor(num(value)), jobs.find((j) => j.id === id)?.remainingQuantity ?? 0)),
    }));
  const grouped = useMemo(
    () =>
      Object.entries(
        openItems.reduce<Record<string, TicketRow[]>>((acc, item) => {
          const key = item.work_tickets?.work_ticket_number ?? "Unknown";
          (acc[key] ??= []).push(item);
          return acc;
        }, {}),
      ),
    [openItems],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Ticket Planning"
        description="Import Sales Orders as Work Tickets, then combine jobs from any open Work Tickets on one plate run."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload Sales Order CSV & Map the Item Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed p-6 hover:bg-muted/40">
            <FileUp className="h-6 w-6" />
            <span className="font-medium">{upload.isPending ? "Importing…" : "Choose Sales Order CSV"}</span>
            <input
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              disabled={upload.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {headers.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["workTicketNumber", "Work Ticket / Sales Order"],
                  ["itemName", "Item Name"],
                  ["description", "Description"],
                  ["length", "Length — Item.CF.Length"],
                  ["width", "Width — Item.CF.Width"],
                  ["quantity", "Quantity"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>
                    {label}
                    {key !== "description" ? " *" : ""}
                  </Label>
                  <Select
                    value={mapping[key] || "__none__"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSV field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not mapped</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span>
                  <b>Length:</b> {mapping.length || "—"} · <b>Width:</b> {mapping.width || "—"} · <b>Quantity:</b>{" "}
                  {mapping.quantity || "—"}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.localStorage.setItem("plateworks-work-ticket-mapping", JSON.stringify(mapping));
                      setSaved(true);
                    }}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saved ? "Mapping Saved" : "Save Mapping"}
                  </Button>
                  <Button onClick={() => importMapped.mutate()} disabled={!records.length || importMapped.isPending}>
                    {importMapped.isPending ? "Importing…" : "Import Work Tickets"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Input Plate Dimensions First</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Plate Length</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={plateLength}
              onChange={(e) => setPlateLength(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Plate Width</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={plateWidth}
              onChange={(e) => setPlateWidth(e.target.value)}
            />
          </div>
          <div className="rounded-md bg-muted p-3">
            <div className="text-sm text-muted-foreground">Plate Area</div>
            <div className="text-xl font-semibold">{plateArea.toLocaleString()} in²</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">3. Open Work Tickets — Select Jobs</CardTitle>
            <p className="text-sm text-muted-foreground">
              Jobs are line items. Jobs from different Work Tickets may be selected together. Partial Work Tickets
              remain available for future runs.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading Work Tickets…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open or partial Work Tickets. Upload a Sales Order CSV above.
            </p>
          ) : (
            <div className="space-y-6">
              {grouped.map(([ticketNumber, items]) => (
                <div key={ticketNumber} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                    <div>
                      <div className="font-semibold">{ticketNumber}</div>
                      <div className="text-xs text-muted-foreground">{items.length} line item(s)</div>
                    </div>
                    <Badge variant={items.some((i) => i.status === "partial") ? "secondary" : "outline"}>
                      {items.some((i) => i.status === "partial") ? "Partial" : "Open"}
                    </Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job / Item</TableHead>
                          <TableHead>L × W</TableHead>
                          <TableHead>Remaining</TableHead>
                          <TableHead>Area Each</TableHead>
                          <TableHead>Fit</TableHead>
                          <TableHead>Select Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => {
                          const rec = result.recommendations.find((r) => r.job.id === item.id);
                          const remaining = item.quantity - item.completed_quantity;
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="font-medium">{item.item_name}</div>
                                <div className="text-xs text-muted-foreground">Line {item.source_row_number}</div>
                              </TableCell>
                              <TableCell>
                                {item.length} × {item.width}
                              </TableCell>
                              <TableCell>{remaining}</TableCell>
                              <TableCell>{(item.length * item.width).toLocaleString()} in²</TableCell>
                              <TableCell>
                                {rec?.fits ? <Badge>Fits</Badge> : <Badge variant="destructive">Does not fit</Badge>}
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="w-24"
                                  type="number"
                                  min="0"
                                  max={rec?.recommendedQuantity ?? 0}
                                  value={selected[item.id] ?? 0}
                                  disabled={!rec?.fits}
                                  onChange={(e) => setQty(item.id, e.target.value)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={applyRecommendations}
              disabled={!result.recommendations.some((r) => r.recommendedQuantity > 0)}
            >
              Select Recommended Jobs
            </Button>
            <Button variant="outline" onClick={() => setSelected({})}>
              Clear Selection
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Plate Run — Selected Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Selected Pieces</div>
              <div className="text-xl font-semibold">{selectedJobs.reduce((n, j) => n + j.selectedQuantity, 0)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total Job Area</div>
              <div className="text-xl font-semibold">{selectedArea.toLocaleString()} in²</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Wastage</div>
              <div className="text-xl font-semibold">{wastage.toLocaleString()} in²</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Utilisation</div>
              <div className="text-xl font-semibold">{utilisation.toFixed(1)}%</div>
            </div>
          </div>
          <Progress value={Math.min(100, utilisation)} />
          <div className="rounded-md bg-muted p-3 text-sm">
            Wastage = <b>Plate Area − Total Area (L × W) of all selected Jobs</b> = {plateArea.toLocaleString()} −{" "}
            {selectedArea.toLocaleString()} = <b>{wastage.toLocaleString()} in²</b>.
          </div>
          <Button
            onClick={() => completeSelected.mutate()}
            disabled={!selectedJobs.length || selectedArea > plateArea || completeSelected.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {completeSelected.isPending ? "Updating…" : "Complete Selected Jobs"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">5. Planning Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Ticket</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Recommended</TableHead>
                  <TableHead>Area Each</TableHead>
                  <TableHead>Orientation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.recommendations.map((r) => (
                  <TableRow key={r.job.id}>
                    <TableCell>{r.job.workTicketNumber}</TableCell>
                    <TableCell>{r.job.itemName}</TableCell>
                    <TableCell>{r.requestedQuantity}</TableCell>
                    <TableCell>{r.recommendedQuantity}</TableCell>
                    <TableCell>{r.areaEach.toLocaleString()} in²</TableCell>
                    <TableCell>{r.orientation === "rotated" ? "Rotated" : "Normal"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Settings2 className="h-4 w-4" />
        Length defaults to <b>Item.CF.Length</b> and Width defaults to <b>Item.CF.Width</b> for your Zoho Sales Order
        CSV.
      </div>
    </div>
  );
}
