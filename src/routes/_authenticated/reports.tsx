import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCsv, printReport } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — PlateWorks" },
      {
        name: "description",
        content: "Inventory, consumption, waste, utilisation, traceability and production reports.",
      },
    ],
  }),
  component: Reports,
});

interface ReportRow {
  [key: string]: string | number;
}

function Reports() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [jobs, batches, plates, offcuts, tx] = await Promise.all([
        supabase.from("jobs").select("*, customers(company)"),
        supabase.from("plate_batches").select("*, manufacturers(name)"),
        supabase.from("plates").select("id,status,batch_id"),
        supabase.from("offcuts").select("id,status,area,created_at"),
        supabase
          .from("inventory_transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      return {
        jobs: jobs.data ?? [],
        batches: batches.data ?? [],
        plates: plates.data ?? [],
        offcuts: offcuts.data ?? [],
        tx: tx.data ?? [],
      };
    },
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const jobsByCustomer: ReportRow[] = Object.values(
    data.jobs.reduce<Record<string, ReportRow>>((acc, j) => {
      const key = j.customers?.company ?? "Unassigned";
      const row = (acc[key] as ReportRow) ?? { customer: key, jobs: 0, plates: 0, waste: 0 };
      row.jobs = Number(row.jobs) + 1;
      row.plates = Number(row.plates) + Number(j.plates_required ?? 0);
      row.waste = Math.round(Number(row.waste) + Number(j.waste_area ?? 0));
      acc[key] = row;
      return acc;
    }, {}),
  );

  const manufacturerPerf: ReportRow[] = data.batches.map((b) => ({
    manufacturer: b.manufacturers?.name ?? "—",
    batch: b.batch_number,
    total: b.total_plates,
    used: b.used_plates,
    available: b.available_plates,
    consumption_rate: `${b.total_plates ? ((b.used_plates / b.total_plates) * 100).toFixed(1) : 0}%`,
    cost_per_plate: Number(b.cost_per_plate),
    stock_value: Number((b.available_plates * Number(b.cost_per_plate)).toFixed(2)),
  }));

  const consumption: ReportRow[] = data.jobs
    .filter((j) => j.status === "completed")
    .map((j) => ({
      job: j.job_number,
      customer: j.customers?.company ?? "—",
      plates: j.plates_required,
      utilization: `${Number(j.utilization).toFixed(1)}%`,
      waste_in2: Math.round(Number(j.waste_area)),
      completed: j.completed_at ? new Date(j.completed_at).toLocaleDateString() : "—",
    }));

  const movement: ReportRow[] = data.tx.map((t) => ({
    date: new Date(t.created_at).toLocaleString(),
    type: t.transaction_type,
    reference: t.reference ?? "—",
    quantity: Number(t.quantity),
    notes: t.notes ?? "",
  }));

  const offcutReport: ReportRow[] = [
    { metric: "Offcuts available", value: data.offcuts.filter((o) => o.status === "available").length },
    { metric: "Offcuts reserved", value: data.offcuts.filter((o) => o.status === "reserved").length },
    { metric: "Offcuts reused", value: data.offcuts.filter((o) => o.status === "used").length },
    {
      metric: "Reusable area (in²)",
      value: Math.round(
        data.offcuts
          .filter((o) => o.status === "available")
          .reduce((s, o) => s + Number(o.area ?? 0), 0),
      ),
    },
    {
      metric: "Offcut utilisation rate",
      value: `${
        data.offcuts.length
          ? ((data.offcuts.filter((o) => o.status === "used").length / data.offcuts.length) * 100).toFixed(1)
          : 0
      }%`,
    },
  ];

  const dailyMap = data.jobs
    .filter((j) => j.completed_at)
    .reduce<Record<string, ReportRow>>((acc, j) => {
      const key = new Date(j.completed_at as string).toLocaleDateString();
      const row = acc[key] ?? { date: key, jobs: 0, plates: 0, waste: 0 };
      row.jobs = Number(row.jobs) + 1;
      row.plates = Number(row.plates) + Number(j.plates_required ?? 0);
      row.waste = Math.round(Number(row.waste) + Number(j.waste_area ?? 0));
      acc[key] = row;
      return acc;
    }, {});
  const daily: ReportRow[] = Object.values(dailyMap);

  const reports = [
    { id: "consumption", label: "Plate consumption", rows: consumption },
    { id: "movement", label: "Plate movement", rows: movement },
    { id: "offcuts", label: "Offcut utilisation", rows: offcutReport },
    { id: "customers", label: "Jobs by customer", rows: jobsByCustomer },
    { id: "manufacturer", label: "Manufacturer & cost", rows: manufacturerPerf },
    { id: "daily", label: "Daily production", rows: daily },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Inventory, consumption, waste, utilisation and traceability."
        actions={
          <Button variant="outline" onClick={printReport}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        }
      />

      <Tabs defaultValue="consumption">
        <TabsList className="flex-wrap">
          {reports.map((r) => (
            <TabsTrigger key={r.id} value={r.id}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {reports.map((r) => (
          <TabsContent key={r.id} value={r.id}>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{r.label}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => exportToCsv(r.id, r.rows)}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {r.rows.length === 0 ? (
                  <EmptyState title="No data yet" description="Complete production to populate this report." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(r.rows[0]).map((h) => (
                            <TableHead key={h} className="capitalize">
                              {h.replace(/_/g, " ")}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.rows.map((row, i) => (
                          <TableRow key={i}>
                            {Object.keys(r.rows[0]).map((h) => (
                              <TableCell key={h} className="numeric">
                                {String(row[h] ?? "")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
