import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — PlateWorks" },
      { name: "description", content: "Stock alerts, offcut availability and production events." },
    ],
  }),
  component: Notifications,
});

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertTriangle,
} as const;

function Notifications() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () =>
      (
        await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read: true }).eq("read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Inventory, offcut and production alerts."
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No notifications" description="Alerts appear as stock and jobs move." />
      ) : (
        <div className="space-y-2">
          {data?.map((n) => {
            const Icon = ICONS[(n.severity as keyof typeof ICONS) ?? "info"] ?? Bell;
            return (
              <Card key={n.id} className={cn(!n.read && "border-primary/40")}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4",
                      n.severity === "critical" || n.severity === "warning"
                        ? "text-warning"
                        : n.severity === "success"
                          ? "text-success"
                          : "text-info",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
