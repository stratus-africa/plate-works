import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MAP: Record<string, string> = {
  available: "bg-success/15 text-success border-success/30",
  active: "bg-success/15 text-success border-success/30",
  completed: "bg-success/15 text-success border-success/30",
  approved: "bg-info/15 text-info border-info/30",
  reserved: "bg-warning/20 text-warning-foreground border-warning/40",
  partially_used: "bg-warning/20 text-warning-foreground border-warning/40",
  in_production: "bg-info/15 text-info border-info/30",
  pending: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  used: "bg-muted text-muted-foreground border-border",
  fully_consumed: "bg-muted text-muted-foreground border-border",
  depleted: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  scrapped: "bg-destructive/15 text-destructive border-destructive/30",
  quarantined: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", MAP[status] ?? "")}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
