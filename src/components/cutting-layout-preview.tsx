import type { LayoutResult } from "@/lib/optimizer";

interface Props {
  layout: LayoutResult;
  plateWidth: number;
  plateHeight: number;
  /** Highlight only this many pieces (used for the last, partially filled plate). */
  piecesToHighlight?: number;
}

/**
 * Graphical cutting layout: master plate, cut lines, artwork placement and
 * remaining offcuts, rendered as scalable SVG.
 */
export function CuttingLayoutPreview({
  layout,
  plateWidth,
  plateHeight,
  piecesToHighlight,
}: Props) {
  const scale = 8;
  const w = plateWidth * scale;
  const h = plateHeight * scale;
  const limit = piecesToHighlight ?? layout.placements.length;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-w-sm rounded border bg-muted/40"
        role="img"
        aria-label="Cutting layout preview"
      >
        <rect x={0} y={0} width={w} height={h} fill="var(--muted)" stroke="var(--border)" />
        {layout.clampMargin > 0 && (
          <rect
            x={layout.clampMargin * scale}
            y={layout.clampMargin * scale}
            width={(plateWidth - layout.clampMargin * 2) * scale}
            height={(plateHeight - layout.clampMargin * 2) * scale}
            fill="var(--background)"
            fillOpacity={0.6}
            stroke="var(--destructive)"
            strokeDasharray="6 4"
            strokeWidth={2}
          />
        )}

        {layout.offcuts.map((o, i) => (
          <rect
            key={`offcut-${i}`}
            x={o.x * scale}
            y={o.y * scale}
            width={o.width * scale}
            height={o.height * scale}
            fill="var(--accent)"
            fillOpacity={0.35}
            stroke="var(--accent)"
            strokeDasharray="4 3"
          />
        ))}
        {layout.placements.map((p) => (
          <g key={p.index}>
            <rect
              x={p.x * scale}
              y={p.y * scale}
              width={p.width * scale}
              height={p.height * scale}
              fill={p.index < limit ? "var(--primary)" : "var(--border)"}
              fillOpacity={p.index < limit ? 0.75 : 0.3}
              stroke="var(--background)"
              strokeWidth={2}
            />
            <text
              x={(p.x + p.width / 2) * scale}
              y={(p.y + p.height / 2) * scale}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={22}
              fill="var(--primary-foreground)"
            >
              {p.index + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-primary/75" /> Allocated
        </span>
        {layout.clampMargin > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm border-2 border-dashed border-destructive" /> Clamp
            margin {layout.clampMargin}&quot; (reserved)
          </span>
        )}

        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-accent/40" /> Reusable offcut
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-muted" /> Unused
        </span>
      </div>
    </div>
  );
}
