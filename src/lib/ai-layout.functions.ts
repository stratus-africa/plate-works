import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  effectiveWidth: z.number().positive(),
  effectiveHeight: z.number().positive(),
  quantity: z.number().int().positive(),
  plateWidth: z.number().positive(),
  plateHeight: z.number().positive(),
  product: z.string().default(""),
  options: z
    .array(
      z.object({
        label: z.string(),
        rotated: z.boolean(),
        across: z.number(),
        down: z.number(),
        piecesPerPlate: z.number(),
        platesRequired: z.number(),
        utilization: z.number(),
        wastePercent: z.number(),
        totalWasteArea: z.number(),
      }),
    )
    .min(1),
});

export interface LayoutAdvice {
  recommended: string;
  headline: string;
  rationale: string;
  savings: string;
  risks: string[];
}

/** Asks Lovable AI to review the computed nesting options and explain the best one. */
export const recommendLayout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<LayoutAdvice> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");

    const prompt = [
      `Printing plate nesting review for product "${data.product || "unnamed job"}".`,
      `Master plate: ${data.plateWidth}in x ${data.plateHeight}in.`,
      `Finished piece (artwork + margins): ${data.effectiveWidth}in x ${data.effectiveHeight}in.`,
      `Order quantity: ${data.quantity} pieces.`,
      "Computed nesting options:",
      ...data.options.map(
        (o) =>
          `- ${o.label} (rotated=${o.rotated}): ${o.across} across x ${o.down} down = ${o.piecesPerPlate} pieces/plate, ${o.platesRequired} plates, ${o.utilization.toFixed(1)}% utilisation, ${o.wastePercent.toFixed(1)}% waste, ${Math.round(o.totalWasteArea)} in² total waste.`,
      ),
      "Recommend one option for the press operator. Be concrete about plates saved and material waste. Mention grain/registration or handling risks only when relevant.",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a prepress production engineer. Reply ONLY with compact JSON: {\"recommended\":string,\"headline\":string,\"rationale\":string,\"savings\":string,\"risks\":string[]}. recommended must exactly match one of the given option labels. Keep rationale under 60 words.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted — add credits to continue.");
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<LayoutAdvice> = {};
    try {
      parsed = JSON.parse(content) as Partial<LayoutAdvice>;
    } catch {
      parsed = { headline: "AI response could not be parsed", rationale: content.slice(0, 400) };
    }

    return {
      recommended: parsed.recommended ?? data.options[0].label,
      headline: parsed.headline ?? "Layout review",
      rationale: parsed.rationale ?? "",
      savings: parsed.savings ?? "",
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 4) : [],
    };
  });
