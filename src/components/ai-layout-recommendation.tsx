import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, RotateCw, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CuttingLayoutPreview } from "@/components/cutting-layout-preview";
import { buildLayout, MASTER_PLATE_HEIGHT, MASTER_PLATE_WIDTH } from "@/lib/optimizer";
import { recommendLayout, type LayoutAdvice } from "@/lib/ai-layout.functions";
import { cn } from "@/lib/utils";

interface Props {
  effectiveWidth: number;
  effectiveHeight: number;
  quantity: number;
  product?: string;
  plateWidth?: number;
  plateHeight?: number;
}

/** Side-by-side orientation comparison with an AI-written recommendation. */
export function AiLayoutRecommendation({
  effectiveWidth,
  effectiveHeight,
  quantity,
  product = "",
  plateWidth = MASTER_PLATE_WIDTH,
  plateHeight = MASTER_PLATE_HEIGHT,
}: Props) {
  const qty = Math.max(1, Math.floor(quantity || 1));
  const [preview, setPreview] = useState<"Portrait (0°)" | "Rotated (90°)">("Portrait (0°)");

  const normal = buildLayout(effectiveWidth, effectiveHeight, plateWidth, plateHeight, false);
  const turned = buildLayout(effectiveHeight, effectiveWidth, plateWidth, plateHeight, true);

  const options = [
    { label: "Portrait (0°)" as const, layout: normal },
    { label: "Rotated (90°)" as const, layout: turned },
  ].map(({ label, layout }) => {
    const platesRequired = layout.piecesPerPlate > 0 ? Math.ceil(qty / layout.piecesPerPlate) : 0;
    const totalWasteArea =
      layout.piecesPerPlate > 0
        ? platesRequired * layout.plateArea - qty * layout.pieceWidth * layout.pieceHeight
        : 0;
    return { label, layout, platesRequired, totalWasteArea };
  });

  const bestLocal = options.reduce((b, o) =>
    o.layout.piecesPerPlate > b.layout.piecesPerPlate ? o : b,
  );

  const run = useServerFn(recommendLayout);
  const advice = useMutation<LayoutAdvice>({
    mutationFn: () =>
      run({
        data: {
          effectiveWidth,
          effectiveHeight,
          quantity: qty,
          plateWidth,
          plateHeight,
          product,
          options: options.map((o) => ({
            label: o.label,
            rotated: o.layout.rotated,
            across: o.layout.across,
            down: o.layout.down,
            piecesPerPlate: o.layout.piecesPerPlate,
            platesRequired: o.platesRequired,
            utilization: o.layout.utilization,
            wastePercent: o.layout.wastePercent,
            totalWasteArea: o.totalWasteArea,
          })),
        },
      }),
  });

  const shown = options.find((o) => o.label === preview) ?? options[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-accent" /> AI cutting layout recommendation
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => advice.mutate()}
          disabled={advice.isPending}
        >
          {advice.isPending ? "Analysing…" : "Analyse layout"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const isBest = o.label === bestLocal.label && o.layout.piecesPerPlate > 0;
            const isAi = advice.data?.recommended === o.label;
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => setPreview(o.label)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  preview === o.label ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <RotateCw
                      className={cn("h-4 w-4", o.layout.rotated ? "text-accent" : "text-muted-foreground")}
                    />
                    {o.label}
                  </span>
                  {isAi ? (
                    <Badge className="bg-accent/20 text-accent-foreground">AI pick</Badge>
                  ) : isBest ? (
                    <Badge variant="outline">Best fit</Badge>
                  ) : null}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <Stat label="Pieces / plate" value={String(o.layout.piecesPerPlate)} />
                  <Stat label="Plates needed" value={String(o.platesRequired)} />
                  <Stat label="Utilisation" value={`${o.layout.utilization.toFixed(1)}%`} />
                  <Stat label="Waste" value={`${Math.round(o.totalWasteArea).toLocaleString()} in²`} />
                </dl>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Preview — {shown.label}
          </p>
          <CuttingLayoutPreview
            layout={shown.layout}
            plateWidth={plateWidth}
            plateHeight={plateHeight}
          />
        </div>

        {advice.isPending && <Skeleton className="h-24 w-full" />}
        {advice.isError && (
          <p className="text-sm text-destructive">{(advice.error as Error).message}</p>
        )}
        {advice.data && (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
            <p className="flex items-center gap-2 font-semibold">
              <ArrowRight className="h-4 w-4 text-accent" />
              {advice.data.headline}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{advice.data.rationale}</p>
            {advice.data.savings && (
              <p className="mt-2 text-sm font-medium text-success">{advice.data.savings}</p>
            )}
            {advice.data.risks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {advice.data.risks.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 text-warning" />
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="numeric text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
