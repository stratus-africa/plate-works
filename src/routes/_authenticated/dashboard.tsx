import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  Layers,
  PackagePlus,
  Recycle,
  Trash2,
  ClipboardList,
} from "lucide-react";
import {
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
import { PageHeader } from "@/components/page-header";
import { fetchDashboard } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Production Dashboard — PlateWorks" },
      {
        name: "description",
        content: "Production control dashboard for plate inventory, work tickets and material utilisation.",
      },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const isToday = (iso?: string | null) => {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
};

function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const {
    plates,
    offcuts,
    jobs,
    batches,
    transactionsToday,
    workTickets = [],
    workTicketItems = [],
  } = data as typeof data & {
    workTickets?: Array<{ id: string; work_ticket_number: string; status: string; created_at: string }>;
    workTicketItems?: Array<{
      id: string;
      work_ticket_id: string;
      item_name: string;
      quantity: number;
      completed_quantity: number;
    }>;
  };

  const available = plates.filter((p) => p.status === "available").length;
  const reserved = plates.filter((p) => p.status === "reserved").length;
  const usedToday = transactionsToday
    .filter((t) => t.transaction_type === "consumption")
    .reduce((s, t) => s + Number(t.quantity ?? 0), 0);
  const receivedToday = transactionsToday
    .filter((t) => t.transaction_type === "receipt")
    .reduce((s, t) => s + Number(t.quantity ?? 0), 0);
  const wasteToday = jobs.filter((j) => isToday(j.completed_at)).reduce((s, j) => s + Number(j.waste_area ?? 0), 0);
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const utilisation = completedJobs.length
    ? completedJobs.reduce((s, j) => s + Number(j.utilization ?? 0), 0) / completedJobs.length
    : 0;
  const pendingJobs = jobs.filter((j) => j.status === "pending").length;
  const inProduction = jobs.filter((j) => j.status === "in_production").length;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const trend = days.map((d) => {
    const key = d.toDateString();
    const dayJobs = jobs.filter((j) => j.completed_at && new Date(j.completed_at).toDateString() === key);
    const plateCount = dayJobs.reduce((s, j) => s + Number(j.plates_required ?? 0), 0);
    const waste = dayJobs.reduce((s, j) => s + Number(j.waste_area ?? 0), 0);
    return {
      day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      utilisation: dayJobs.length ? dayJobs.reduce((s, j) => s + Number(j.utilization ?? 0), 0) / dayJobs.length : 0,
      waste: Math.round(waste),
      plates: plateCount,
    };
  });

  const byType = Object.values(
    batches.reduce<Record<string, { name: string; plates: number }>>((acc, b) => {
      const name = b.plate_type ?? "Unknown";
      acc[name] ??= { name, plates: 0 };
      acc[name].plates += Number(b.available_plates ?? 0);
      return acc;
    }, {}),
  );

  const materials = Object.values(
    batches.reduce<Record<string, { name: string; plates: number }>>((acc, b) => {
      const name = (b as unknown as { manufacturers?: { name?: string } }).manufacturers?.name ?? "Unassigned";
      acc[name] ??= { name, plates: 0 };
      acc[name].plates += Number(b.available_plates ?? 0);
      return acc;
    }, {}),
  )
    .sort((a, b) => b.plates - a.plates)
    .slice(0, 5);

  const ticketRows = workTickets.length
    ? workTickets.slice(0, 5).map((ticket) => {
        const items = workTicketItems.filter((i) => i.work_ticket_id === ticket.id);
        const total = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        const done = items.reduce((s, i) => s + Number(i.completed_quantity || 0), 0);
        return { ...ticket, jobs: items.length, progress: total ? (done / total) * 100 : 0 };
      })
    : jobs
        .slice()
        .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        .slice(0, 5)
        .map((job, i) => ({
          id: job.id,
          work_ticket_number: `Job ${i + 1}`,
          status: job.status,
          jobs: 1,
          progress: job.status === "completed" ? 100 : job.status === "in_production" ? 50 : 0,
        }));

  const activity = [
    ...jobs
      .filter((j) => j.completed_at)
      .map((j) => ({
        type: "complete",
        title: "Job completed",
        detail: `Job ${j.id.slice(0, 8)}`,
        date: j.completed_at!,
      })),
    ...transactionsToday.map((t) => ({
      type: "inventory",
      title: t.transaction_type === "receipt" ? "Plate received" : "Plate consumed",
      detail: `${Number(t.quantity ?? 0)} plate${Number(t.quantity ?? 0) === 1 ? "" : "s"}`,
      date: t.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Dashboard"
        description="Monitor plate inventory, production flow and material utilisation in real time."
        actions={
          <Button asChild>
            <Link to="/work-ticket">
              <ClipboardList className="mr-2 h-4 w-4" />
              Plan Work Tickets
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <DashboardKpi
          label="Plates available"
          value={available}
          hint={`of ${plates.length} total`}
          icon={Layers}
          tone="blue"
          trend="+2"
        />
        <DashboardKpi
          label="Plates reserved"
          value={reserved}
          hint={`of ${plates.length} total`}
          icon={Clock3}
          tone="purple"
          trend="0"
        />
        <DashboardKpi
          label="Plates used today"
          value={usedToday}
          hint={`of ${plates.length} total`}
          icon={CheckCircle2}
          tone="green"
          trend={`+${usedToday}`}
        />
        <DashboardKpi
          label="Plates received today"
          value={receivedToday}
          hint={`of ${plates.length} total`}
          icon={PackagePlus}
          tone="cyan"
          trend={`+${receivedToday}`}
        />
        <DashboardKpi
          label="Waste today"
          value={`${Math.round(wasteToday).toLocaleString()} in²`}
          hint="Material lost"
          icon={Trash2}
          tone="orange"
          trend={utilisation ? `${(100 - utilisation).toFixed(1)}%` : "0%"}
          down
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Production Overview</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Plate usage and waste trend · last 14 days</p>
            </div>
            <div className="hidden rounded-lg border p-1 sm:flex">
              <span className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">14 Days</span>
            </div>
          </CardHeader>
          <CardContent className="h-80 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis
                  yAxisId="left"
                  domain={[0, 100]}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="utilisation"
                  name="Plate utilisation"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="waste"
                  name="Waste (in²)"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Plate Utilisation</CardTitle>
            <p className="text-xs text-muted-foreground">Current production performance</p>
          </CardHeader>
          <CardContent className="h-80">
            <div className="flex h-full flex-col items-center justify-center">
              <div className="relative h-48 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Used", value: Math.max(0, utilisation) },
                        { name: "Remaining", value: Math.max(0, 100 - utilisation) },
                      ]}
                      dataKey="value"
                      innerRadius={68}
                      outerRadius={86}
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      <Cell fill="var(--chart-1)" />
                      <Cell fill="var(--muted)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="numeric text-4xl font-semibold">{utilisation.toFixed(0)}%</span>
                  <span className="text-xs text-muted-foreground">Utilisation rate</span>
                </div>
              </div>
              <div className="mt-4 grid w-full grid-cols-3 gap-3 text-center">
                <Metric
                  label="Total plate area"
                  value={`${plates.reduce((s, p) => s + Number(p.area ?? 0), 0).toLocaleString()} in²`}
                />
                <Metric
                  label="Total job area"
                  value={`${completedJobs.reduce((s, j) => s + Number(j.utilization ?? 0), 0).toLocaleString()}%`}
                />
                <Metric label="Wastage" value={`${Math.round(wasteToday).toLocaleString()} in²`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 shadow-sm xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activity.length ? (
              activity.map((item) => (
                <ActivityRow
                  key={`${item.type}-${item.date}-${item.detail}`}
                  title={item.title}
                  detail={item.detail}
                  date={item.date}
                  type={item.type}
                />
              ))
            ) : (
              <EmptyPanel text="No recent activity" />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Work Tickets</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Open and recently processed work</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/work-ticket">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Work Ticket</th>
                    <th className="px-4 py-3 text-left font-medium">Jobs</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-6 py-4 font-medium">{row.work_ticket_number}</td>
                      <td className="px-4 py-4">{row.jobs}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-4 min-w-40">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, row.progress)}%` }}
                            />
                          </div>
                          <span className="numeric w-10 text-right text-xs text-muted-foreground">
                            {Math.round(row.progress)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Plate Usage by Type</CardTitle>
            <p className="text-xs text-muted-foreground">Current inventory distribution</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byType} dataKey="plates" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>
                  {byType.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top Materials by Usage</CardTitle>
            <p className="text-xs text-muted-foreground">Available plate inventory by manufacturer</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={materials} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis dataKey="name" type="category" width={90} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="plates" fill="var(--chart-1)" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MiniStat icon={AlertTriangle} label="Jobs pending" value={pendingJobs} tone="warning" />
        <MiniStat icon={Activity} label="Jobs in production" value={inProduction} tone="info" />
        <MiniStat
          icon={Recycle}
          label="Offcuts available"
          value={offcuts.filter((o) => o.status === "available").length}
          tone="success"
        />
      </section>
    </div>
  );
}

function DashboardKpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  trend,
  down = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Layers;
  tone: "blue" | "purple" | "green" | "cyan" | "orange";
  trend: string;
  down?: boolean;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    green: "bg-emerald-50 text-emerald-600",
    cyan: "bg-cyan-50 text-cyan-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="numeric mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className={`rounded-xl p-3 ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div
          className={`mt-3 flex items-center gap-1 text-xs font-medium ${down ? "text-emerald-600" : "text-emerald-600"}`}
        >
          {down ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
          {trend} <span className="font-normal text-muted-foreground">vs previous period</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
function ActivityRow({ title, detail, date, type }: { title: string; detail: string; date: string; type: string }) {
  const Icon = type === "complete" ? CheckCircle2 : type === "inventory" ? PackagePlus : Bell;
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-full bg-muted p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <time className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(date)}</time>
    </div>
  );
}
function relativeTime(date: string) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
function StatusBadge({ status }: { status: string }) {
  const normalized = status.replace("_", " ");
  const tone =
    status === "completed" || status === "complete"
      ? "bg-emerald-100 text-emerald-700"
      : status === "partial" || status === "in_production"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${tone}`}>
      {normalized}
    </span>
  );
}
function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  tone: "warning" | "info" | "success";
}) {
  const cls =
    tone === "warning"
      ? "text-amber-600 bg-amber-50"
      : tone === "success"
        ? "text-emerald-600 bg-emerald-50"
        : "text-blue-600 bg-blue-50";
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-lg p-2 ${cls}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="numeric text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function EmptyPanel({ text }: { text: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>;
}
