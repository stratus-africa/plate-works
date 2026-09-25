import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  FileUp,
  Layers3,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { optimiseWorkTicket, type WorkTicketJob } from "@/lib/work-ticket-optimizer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const dupKey = (ticket: string, name: string, l: number, w: number) =>
  `${ticket.trim().toLowerCase()}|${name.trim().toLowerCase()}|${l}|${w}`;

export const Route = createFileRoute("/_authenticated/work-ticket")({
  head: () => ({ meta: [{ title: "Jobs & Work Ticket Optimiser — PlateWorks" }] }),
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
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

function detect(headers: string[], candidates: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = lower.indexOf(candidate.toLowerCase());
    if (index >= 0) return headers[index];
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
  const [mappingOpen, setMappingOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ticketFilter, setTicketFilter] = useState("");
  const [showOnlyFit, setShowOnlyFit] = useState(true);
  const [dupCount, setDupCount] = useState<number | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<{ id: string; number: string } | null>(null);

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
        .filter((job) => job.length > 0 && job.width > 0 && (job.remainingQuantity ?? 0) > 0),
    [openItems],
  );

  const plateArea = num(plateLength) * num(plateWidth);
  const result = useMemo(
    () => optimiseWorkTicket(jobs, num(plateLength), num(plateWidth)),
    [jobs, plateLength, plateWidth],
  );

  const selectedJobs = useMemo(
    () =>
      jobs
        .map((job) => ({
          ...job,
          selectedQuantity: Math.min(selected[job.id] ?? 0, job.remainingQuantity ?? 0),
        }))
        .filter((job) => job.selectedQuantity > 0),
    [jobs, selected],
  );

  const selectedArea = selectedJobs.reduce((sum, job) => sum + job.length * job.width * job.selectedQuantity, 0);
  const wastage = Math.max(0, plateArea - selectedArea);
  const utilisation = plateArea ? (selectedArea / plateArea) * 100 : 0;
  const selectedPieces = selectedJobs.reduce((sum, job) => sum + job.selectedQuantity, 0);

  const grouped = useMemo(() => {
    const filtered = openItems.filter((item) =>
      (item.work_tickets?.work_ticket_number ?? "").toLowerCase().includes(ticketFilter.toLowerCase()),
    );
    return Object.entries(
      filtered.reduce<Record<string, TicketRow[]>>((acc, item) => {
        const key = item.work_tickets?.work_ticket_number ?? "Unknown";
        (acc[key] ??= []).push(item);
        return acc;
      }, {}),
    );
  }, [openItems, ticketFilter]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("The CSV does not contain any line items.");
      const nextHeaders = rows[0].map((header) => header.trim());
      const nextRecords = rows
        .slice(1)
        .map((row) => Object.fromEntries(nextHeaders.map((header, index) => [header, (row[index] ?? "").trim()])));
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
      setMappingOpen(true);
      setSaved(false);
      setSelected({});
      return nextRecords.length;
    },
    onSuccess: (count) => toast.success(`${count} CSV rows loaded. Confirm the field mapping before importing.`),
    onError: (error) => toast.error((error as Error).message),
  });

  const validateMapping = () => {
    if (!records.length) throw new Error("Upload a Sales Order CSV first.");
    if (!mapping.workTicketNumber || !mapping.itemName || !mapping.length || !mapping.width || !mapping.quantity) {
      throw new Error("Map Work Ticket, Item Name, Length, Width and Quantity before importing.");
    }
  };

  const ticketOf = (row: Record<string, string>, index: number) =>
    row[mapping.workTicketNumber] || `Imported CSV — ${index + 1}`;

  /** Keys of line items already stored for the ticket numbers present in the CSV. */
  const loadExistingKeys = async () => {
    const numbers = Array.from(new Set(records.map(ticketOf)));
    const { data, error } = await supabase
      .from("work_ticket_items")
      .select("item_name,length,width,work_tickets!inner(work_ticket_number)")
      .in("work_tickets.work_ticket_number", numbers);
    if (error) throw error;
    return new Set(
      ((data ?? []) as unknown as Array<{ item_name: string; length: number; width: number; work_tickets: { work_ticket_number: string } }>).map(
        (r) => dupKey(r.work_tickets.work_ticket_number, r.item_name, num(r.length), num(r.width)),
      ),
    );
  };

  const rowKey = (row: Record<string, string>, index: number) =>
    dupKey(ticketOf(row, index), row[mapping.itemName] || "Unnamed item", num(row[mapping.length]), num(row[mapping.width]));

  const checkDuplicates = useMutation({
    mutationFn: async () => {
      validateMapping();
      const seen = await loadExistingKeys();
      let dups = 0;
      records.forEach((row, i) => {
        const k = rowKey(row, i);
        if (seen.has(k)) dups++;
        else seen.add(k);
      });
      return dups;
    },
    onSuccess: (dups) => {
      if (dups > 0) setDupCount(dups);
      else importMapped.mutate(false);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const importMapped = useMutation({
    mutationFn: async (skipDuplicates: boolean) => {
      validateMapping();
      const seen = skipDuplicates ? await loadExistingKeys() : new Set<string>();
      let skipped = 0;
      const groups = new Map<string, Array<{ row: Record<string, string>; rowNumber: number }>>();
      records.forEach((row, index) => {
        if (skipDuplicates) {
          const k = rowKey(row, index);
          if (seen.has(k)) {
            skipped++;
            return;
          }
          seen.add(k);
        }
        const ticketNumber = ticketOf(row, index);
        const list = groups.get(ticketNumber) ?? [];
        list.push({ row, rowNumber: index + 2 });
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
        let nextRow = Math.max(0, ...(existingItems.data ?? []).map((r) => r.source_row_number)) + 1;
        const used = new Set((existingItems.data ?? []).map((r) => r.source_row_number));

        const inserts = ticketRows
          .map(({ row, rowNumber }) => ({
            work_ticket_id: ticketId!,
            source_row_number: used.has(rowNumber) ? nextRow++ : rowNumber,
            item_name: row[mapping.itemName] || "Unnamed item",
            description: mapping.description ? row[mapping.description] || null : null,
            length: num(row[mapping.length]),
            width: num(row[mapping.width]),
            quantity: Math.max(1, Math.floor(num(row[mapping.quantity]) || 1)),
            source_data: row,
          }))
          .filter((item) => item.length > 0 && item.width > 0);

        if (inserts.length) {
          const insertedItems = await supabase.from("work_ticket_items").insert(inserts);
          if (insertedItems.error) throw insertedItems.error;
          imported += inserts.length;
        }
        await supabase.rpc("sync_work_ticket_status", { p_work_ticket_id: ticketId });
      }
      return { imported, skipped };
    },
    onSuccess: ({ imported, skipped }) => {
      toast.success(
        `${imported} jobs imported${skipped ? `, ${skipped} duplicate(s) skipped` : ""}.`,
      );
      setDupCount(null);
      setMappingOpen(false);
      queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const deleteTicket = useMutation({
    mutationFn: async (id: string) => {
      const items = await supabase.from("work_ticket_items").delete().eq("work_ticket_id", id);
      if (items.error) throw items.error;
      const t = await supabase.from("work_tickets").delete().eq("id", id);
      if (t.error) throw t.error;
    },
    onSuccess: () => {
      toast.success("Work ticket deleted");
      setTicketToDelete(null);
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] });
    },
    onError: (error) => toast.error((error as Error).message),
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
      toast.success("Selected jobs completed. Work Ticket statuses were updated automatically.");
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const setQty = (id: string, value: string) => {
    setSelected((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(Math.floor(num(value)), jobs.find((job) => job.id === id)?.remainingQuantity ?? 0)),
    }));
  };

  const applyRecommendations = () => {
    const firstPlate = result.plates[0];
    if (!firstPlate) {
      setSelected({});
      return;
    }
    const counts: Record<string, number> = {};
    for (const placement of firstPlate.placements) {
      counts[placement.jobId] = (counts[placement.jobId] ?? 0) + 1;
    }
    setSelected(counts);
  };

  const toggleAllVisible = () => {
    const visible = jobs.filter((job) => {
      const recommendation = result.recommendations.find((item) => item.job.id === job.id);
      return recommendation?.fits && (!showOnlyFit || recommendation.recommendedQuantity > 0);
    });
    const counts: Record<string, number> = {};
    for (const job of visible) counts[job.id] = job.remainingQuantity ?? 0;
    setSelected(counts);
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Jobs & Work Ticket Optimiser"
        description="Plan one plate from jobs across multiple open Work Tickets. Completed quantities are carried forward automatically."
      />

      {/* Plate-first command bar */}
      <Card className="overflow-hidden border-2">
        <CardContent className="p-0">
          <div className="flex flex-col gap-5 bg-muted/30 p-5 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Layers3 className="h-4 w-4" />
                1. Plate Dimensions
                <Badge variant="secondary">Start here</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
                <div className="space-y-1.5">
                  <Label>Length</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={plateLength}
                    onChange={(e) => setPlateLength(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Width</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={plateWidth}
                    onChange={(e) => setPlateWidth(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 lg:min-w-[430px]">
              <Metric label="Plate Area" value={`${plateArea.toLocaleString()} in²`} />
              <Metric label="Jobs Selected" value={String(selectedJobs.length)} />
              <Metric label="Utilisation" value={`${utilisation.toFixed(1)}%`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Single merged workspace */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    2
                  </span>
                  Open Work Tickets & Jobs
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Jobs are line items. Mix jobs from different Work Tickets when they fit this plate.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["work-ticket-items"] })}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </Button>
                <label className="cursor-pointer">
                  <Button size="sm" asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" /> Upload Sales Order
                    </span>
                  </Button>
                  <input
                    className="hidden"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload.mutate(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Search Work Ticket…"
                value={ticketFilter}
                onChange={(e) => setTicketFilter(e.target.value)}
                className="sm:max-w-sm"
              />
              <Button
                variant={showOnlyFit ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowOnlyFit((value) => !value)}
              >
                {showOnlyFit ? "Showing recommended fits" : "Showing all jobs"}
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleAllVisible}>
                Select all visible
              </Button>
            </div>
          </div>

          {mappingOpen && (
            <div className="border-b bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <FileUp className="h-4 w-4" /> 3. Map Sales Order Fields
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your Zoho Sales Order fields are detected automatically. Confirm them before importing.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setMappingOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["workTicketNumber", "Work Ticket / Sales Order", true],
                    ["itemName", "Item Name", true],
                    ["description", "Description", false],
                    ["length", "Length", true],
                    ["width", "Width", true],
                    ["quantity", "Quantity", true],
                  ] as const
                ).map(([key, label, required]) => (
                  <div key={key} className="space-y-1.5">
                    <Label>
                      {label}
                      {required ? " *" : ""}
                    </Label>
                    <Select
                      value={mapping[key] || "__none__"}
                      onValueChange={(value) =>
                        setMapping((current) => ({ ...current, [key]: value === "__none__" ? "" : value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select CSV field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not mapped</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
                <div className="text-xs text-muted-foreground">
                  Length: <b>{mapping.length || "—"}</b> · Width: <b>{mapping.width || "—"}</b> · Quantity:{" "}
                  <b>{mapping.quantity || "—"}</b>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.localStorage.setItem("plateworks-work-ticket-mapping", JSON.stringify(mapping));
                      setSaved(true);
                    }}
                  >
                    <Save className="mr-2 h-4 w-4" /> {saved ? "Mapping Saved" : "Save Mapping"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => checkDuplicates.mutate()}
                    disabled={!records.length || importMapped.isPending || checkDuplicates.isPending}
                  >
                    {importMapped.isPending || checkDuplicates.isPending ? "Importing…" : "Import Work Tickets"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <AlertDialog open={dupCount !== null} onOpenChange={(o) => !o && setDupCount(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{dupCount} duplicate line item(s) found</AlertDialogTitle>
                <AlertDialogDescription>
                  These rows match jobs already in the system (same work ticket, item and size) or repeat within
                  the file. Skip duplicates to ignore them and import only new rows.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant="outline" onClick={() => importMapped.mutate(false)} disabled={importMapped.isPending}>
                  Import all
                </Button>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    importMapped.mutate(true);
                  }}
                  disabled={importMapped.isPending}
                >
                  Skip duplicates
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={!!ticketToDelete} onOpenChange={(o) => !o && setTicketToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete work ticket {ticketToDelete?.number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the work ticket and all of its line items.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    if (ticketToDelete) deleteTicket.mutate(ticketToDelete.id);
                  }}
                  disabled={deleteTicket.isPending}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading open Work Tickets…</div>
            ) : grouped.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <FileUp className="h-5 w-5" />
                </div>
                <div className="font-medium">No open or partial Work Tickets</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a Sales Order CSV to create Work Tickets and their Jobs.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {grouped.map(([ticketNumber, items]) => {
                  const ticketHasSelection = items.some((item) => (selected[item.id] ?? 0) > 0);
                  const ticketStatus = items.some((item) => item.status === "partial") ? "Partial" : "Open";
                  return (
                    <div key={ticketNumber}>
                      <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold">{ticketNumber}</span>
                            <Badge variant={ticketStatus === "Partial" ? "secondary" : "outline"}>{ticketStatus}</Badge>
                            {ticketHasSelection && <Badge>Selected</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {items.length} line item(s) · Jobs can be completed across multiple runs
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete work ticket ${ticketNumber}`}
                            onClick={() => setTicketToDelete({ id: items[0].work_ticket_id, number: ticketNumber })}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[220px]">Job / Item</TableHead>
                              <TableHead>L × W</TableHead>
                              <TableHead>Remaining</TableHead>
                              <TableHead>Area Each</TableHead>
                              <TableHead>Fit</TableHead>
                              <TableHead className="w-[120px]">Select Qty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item) => {
                              const recommendation = result.recommendations.find((rec) => rec.job.id === item.id);
                              const remaining = Math.max(0, item.quantity - item.completed_quantity);
                              const visible =
                                recommendation?.fits && (!showOnlyFit || (recommendation.recommendedQuantity ?? 0) > 0);
                              if (!visible) return null;
                              return (
                                <TableRow
                                  key={item.id}
                                  className={(selected[item.id] ?? 0) > 0 ? "bg-primary/5" : undefined}
                                >
                                  <TableCell>
                                    <div className="font-medium">{item.item_name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Line {item.source_row_number}
                                      {item.description ? ` · ${item.description}` : ""}
                                    </div>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {item.length} × {item.width}
                                  </TableCell>
                                  <TableCell>{remaining}</TableCell>
                                  <TableCell>{(item.length * item.width).toLocaleString()} in²</TableCell>
                                  <TableCell>
                                    {recommendation?.fits ? (
                                      <Badge>Fits</Badge>
                                    ) : (
                                      <Badge variant="destructive">No fit</Badge>
                                    )}
                                    {recommendation?.orientation === "rotated" && (
                                      <div className="mt-1 text-[10px] text-muted-foreground">Rotated</div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      className="w-24"
                                      type="number"
                                      min="0"
                                      max={Math.min(remaining, recommendation?.recommendedQuantity ?? remaining)}
                                      value={selected[item.id] ?? 0}
                                      disabled={!recommendation?.fits}
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Optimiser panel is now part of the same Jobs window */}
        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          <Card className="overflow-hidden border-2">
            <div className="bg-primary p-5 text-primary-foreground">
              <div className="flex items-center gap-2 text-sm font-medium opacity-90">
                <Sparkles className="h-4 w-4" /> Plate Optimiser
              </div>
              <div className="mt-1 text-2xl font-bold">{utilisation.toFixed(1)}% utilised</div>
              <div className="mt-3">
                <Progress value={Math.min(100, utilisation)} />
              </div>
            </div>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Selected Pieces" value={String(selectedPieces)} />
                <Metric label="Selected Jobs" value={String(selectedJobs.length)} />
                <Metric label="Job Area" value={`${selectedArea.toLocaleString()} in²`} />
                <Metric label="Wastage" value={`${wastage.toLocaleString()} in²`} />
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plate</span>
                  <b>
                    {plateLength} × {plateWidth}
                  </b>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted-foreground">Plate Area</span>
                  <b>{plateArea.toLocaleString()} in²</b>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted-foreground">Wastage</span>
                  <b>{wastage.toLocaleString()} in²</b>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <b className="text-foreground">Wastage = Plate Area − Total Job Area.</b>
                <br />
                {plateArea.toLocaleString()} − {selectedArea.toLocaleString()} = {wastage.toLocaleString()} in²
              </div>
              <div className="grid gap-2">
                <Button
                  onClick={applyRecommendations}
                  disabled={!result.recommendations.some((rec) => rec.recommendedQuantity > 0)}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Build Best-Fit Plate
                </Button>
                <Button variant="outline" onClick={() => setSelected({})} disabled={!selectedJobs.length}>
                  Clear Selection
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Selected Jobs
              </div>
              {selectedJobs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Select jobs on the left or let the optimiser build the best-fit plate.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedJobs.map((job) => (
                    <div key={job.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{job.itemName}</div>
                          <div className="text-[11px] text-muted-foreground">{job.workTicketNumber}</div>
                        </div>
                        <Badge variant="secondary">×{job.selectedQuantity}</Badge>
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {job.length} × {job.width}
                        </span>
                        <span>{(job.length * job.width * job.selectedQuantity).toLocaleString()} in²</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button
                className="mt-4 w-full"
                onClick={() => completeSelected.mutate()}
                disabled={!selectedJobs.length || selectedArea > plateArea || completeSelected.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {completeSelected.isPending ? "Updating…" : "Complete Selected Jobs"}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Partial Work Tickets stay open for future plate runs.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Settings2 className="h-4 w-4" /> Field Mapping
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Length defaults to <b>Item.CF.Length</b> and Width to <b>Item.CF.Width</b>.
              </p>
              {headers.length > 0 && (
                <Button variant="link" className="h-auto px-0 pt-2 text-xs" onClick={() => setMappingOpen(true)}>
                  Review current CSV mapping
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}
