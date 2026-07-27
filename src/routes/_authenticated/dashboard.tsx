import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Layers,
  PackagePlus,
  Percent,
  Recycle,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { fetchDashboard } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — PlateWorks" },
      { name: "description", content: "Live plate inventory, utilisation and production KPIs." },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const isToday = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const { plates, offcuts, jobs, batches, transactionsToday } = data;

  const platesAvailable = plates.filter((p) => p.status === "available").length;
  const platesReserved = plates.filter((p) => p.status === "reserved").length;
  const platesUsedToday = transactionsToday
    .filter((t) => t.transaction_type === "consumption")
    .reduce((sum, t) => sum + Number(t.quantity ?? 0), 0);
  const platesReceivedToday = transactionsToday
    .filter((t) => t.transaction_type === "receipt")
    .reduce((sum, t) => sum + Number(t.quantity ?? 0), 0);
  const offcutsAvailable = offcuts.filter((o) => o.status === "available").length;
  const offcutsUsedToday = offcuts.filter((o) => o.status === "used" && isToday(o.created_at)).length;

  const completed = jobs.filter((j) => j.status === "completed");
  const utilization =
    completed.length > 0
      ? completed.reduce((s, j) => s + Number(j.utilization ?? 0), 0) / completed.length
      : 0;
  const wasteToday = jobs
    .filter((j) => isToday(j.completed_at))
    .reduce((s, j) => s + Number(j.waste_area ?? 0), 0);

  // Charts
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const trend = days.map((d) => {
    const key = d.toDateString();
    const dayJobs = jobs.filter((j) => j.completed_at && new Date(j.completed_at).toDateString() === key);
    return {
      day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      plates: dayJobs.reduce((s, j) => s + Number(j.plates_required ?? 0), 0),
      waste: Math.round(dayJobs.reduce((s, j) => s + Number(j.waste_area ?? 0), 0)),
      offcuts: offcuts.filter((o) => new Date(o.created_at).toDateString() === key).length,
    };
  });

  const byManufacturer = Object.values(
    batches.reduce<Record<string, { name: string; plates: number }>>((acc, b) => {
      const name =
        (b as unknown as { manufacturers?: { name?: string } }).manufacturers?.name ?? "Unassigned";
      acc[name] = acc[name] ?? { name, plates: 0 };
      acc[name].plates += Number(b.available_plates ?? 0);
      return acc;
    }, {}),
  );

  const byType = Object.values(
    batches.reduce<Record<string, { name: string; plates: number }>>((acc, b) => {
      const name = b.plate_type ?? "Unknown";
      acc[name] = acc[name] ?? { name, plates: 0 };
      acc[name].plates += Number(b.available_plates ?? 0);
      return acc;
    }, {}),
  );

  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i), 1);
    return d;
  });
  const monthly = months.map((m) => {
    const label = m.toLocaleDateString(undefined, { month: "short" });
    const inMonth = jobs.filter(
      (j) =>
        j.completed_at &&
        new Date(j.completed_at).getMonth() === m.getMonth() &&
        new Date(j.completed_at).getFullYear() === m.getFullYear(),
    );
    return {
      month: label,
      plates: inMonth.reduce((s, j) => s + Number(j.plates_required ?? 0), 0),
      jobs: inMonth.length,
    };
  });

  return (
    <div>
      <PageHeader
        title="Production Dashboard"
        description="Real-time plate inventory, material utilisation and job flow."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Plates available" value={platesAvailable} icon={Layers} tone="success" />
        <KpiCard label="Plates reserved" value={platesReserved} icon={Clock} tone="warning" />
        <KpiCard label="Plates used today" value={platesUsedToday} icon={Activity} />
        <KpiCard label="Plates received today" value={platesReceivedToday} icon={PackagePlus} tone="info" />
        <KpiCard label="Available offcuts" value={offcutsAvailable} icon={Scissors} tone="info" />
        <KpiCard label="Offcuts utilised today" value={offcutsUsedToday} icon={Recycle} tone="success" />
        <KpiCard
          label="Material utilisation"
          value={`${utilization.toFixed(1)}%`}
          icon={Percent}
          tone={utilization > 75 ? "success" : "warning"}
        />
        <KpiCard
          label="Waste today"
          value={`${Math.round(wasteToday).toLocaleString()} in²`}
          icon={Trash2}
          tone="destructive"
        />
        <KpiCard
          label="Jobs pending"
          value={jobs.filter((j) => j.status === "pending").length}
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Jobs in production"
          value={jobs.filter((j) => j.status === "in_production").length}
          icon={Activity}
          tone="info"
        />
        <KpiCard label="Completed jobs" value={completed.length} icon={CheckCircle2} tone="success" />
        <KpiCard label="Active batches" value={batches.length} icon={Boxes} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Plate consumption (14 days)">
          <AreaChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
            <Area dataKey="plates" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.25} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Waste trend (in²)">
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
            <Line dataKey="waste" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Offcut generation & utilisation">
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
            <Bar dataKey="offcuts" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Inventory by manufacturer">
          <BarChart data={byManufacturer} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis dataKey="name" type="category" width={90} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
            <Bar dataKey="plates" fill="var(--chart-1)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Inventory by plate type">
          <PieChart>
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
            <Pie data={byType} dataKey="plates" nameKey="name" outerRadius={90} label>
              {byType.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>

        <ChartCard title="Monthly material usage & production volume">
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
            <Bar dataKey="plates" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="jobs" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
