import type { WorkTicketPlan } from "@/lib/work-ticket-optimizer";

interface Props { plan: WorkTicketPlan; }

export function WorkTicketLayoutPreview({ plan }: Props) {
  const scale = 8;
  const w = Math.max(plan.plateWidth * scale, 1);
  const h = Math.max(plan.plateHeight * scale, 1);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto max-h-[620px] w-full rounded-md border bg-muted/40" role="img" aria-label="Work ticket plate layout preview">
        <rect width={w} height={h} fill="var(--muted)" stroke="var(--border)" />
        {plan.placements.map((p) => (
          <g key={`${p.jobId}-${p.index}`}>
            <rect x={p.x * scale} y={p.y * scale} width={p.width * scale} height={p.length * scale} fill="var(--primary)" fillOpacity={0.72} stroke="var(--background)" strokeWidth={1.5} />
            <text x={(p.x + p.width / 2) * scale} y={(p.y + p.length / 2) * scale} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, Math.min(22, Math.min(p.width, p.length) * scale * 0.16))} fill="var(--primary-foreground)">
              {p.jobNumber}
            </text>
          </g>
        ))}
      </svg>
      <div className="text-xs text-muted-foreground">Each rectangle is one selected line item. Rotated pieces are automatically marked in the job table.</div>
    </div>
  );
}
