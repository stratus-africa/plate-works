import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCsv } from "@/lib/export";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({
    meta: [
      { title: "Production Jobs — PlateWorks" },
      { name: "description", content: "All production jobs with plate requirements, utilisation and status." },
    ],
  }),
  component: Jobs,
});

function Jobs() {
  const { can } = useAuth();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, customers(company)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (data ?? []).filter(
    (j) =>
      (status === "all" || j.status === status) &&
      (j.job_number.toLowerCase().includes(term.toLowerCase()) ||
        j.product.toLowerCase().includes(term.toLowerCase()) ||
        (j.customers?.company ?? "").toLowerCase().includes(term.toLowerCase())),
  );

  return (
    <div>
      <PageHeader
        title="Production Jobs"
        description="Jobs are optimised on receipt and allocated from offcuts before new plates."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  "jobs",
                  rows.map((j) => ({
                    job: j.job_number,
                    customer: j.customers?.company ?? "",
                    product: j.product,
                    artwork: `${j.artwork_width}x${j.artwork_height}`,
                    effective: `${j.effective_width}x${j.effective_height}`,
                    quantity: j.quantity,
                    plates_required: j.plates_required,
                    utilization: j.utilization,
                    status: j.status,
                    due_date: j.due_date,
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            {can("createJobs") && (
              <Button asChild>
                <Link to="/jobs/new">
                  <Plus className="mr-2 h-4 w-4" /> New job
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              placeholder="Search job, product or customer…"
              className="max-w-sm"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="in_production">In production</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState title="No jobs" description="Create a production job to run the optimisation engine." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Effective size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Plates</TableHead>
                    <TableHead className="text-right">Utilisation</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((j) => (
                    <TableRow key={j.id} className="cursor-pointer">
                      <TableCell className="numeric font-medium">
                        <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="hover:underline">
                          {j.job_number}
                        </Link>
                      </TableCell>
                      <TableCell>{j.customers?.company ?? "—"}</TableCell>
                      <TableCell>{j.product}</TableCell>
                      <TableCell className="numeric text-right">
                        {Number(j.effective_width).toFixed(1)}×{Number(j.effective_height).toFixed(1)}"
                      </TableCell>
                      <TableCell className="numeric text-right">{j.quantity}</TableCell>
                      <TableCell className="numeric text-right">{j.plates_required}</TableCell>
                      <TableCell className="numeric text-right">
                        {Number(j.utilization).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-sm">{j.due_date ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={j.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
