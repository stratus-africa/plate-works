import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

export function KpiCard({ label, value, hint, icon: Icon, tone = "default" }: Props) {
  return (
    <Card className="kpi-surface border-border/70">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="numeric mt-1 text-2xl font-semibold">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-md bg-muted p-2", toneClass[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
