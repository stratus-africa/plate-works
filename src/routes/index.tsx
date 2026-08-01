import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Boxes, Recycle, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PlateWorks — Plate Printing Production Management System" },
      {
        name: "description",
        content:
          "Track every printing plate from receipt to consumption: batch intake, plate optimisation, offcut reuse, waste analytics and production reporting.",
      },
      { property: "og:title", content: "PlateWorks — Plate Printing Production Management System" },
      {
        property: "og:description",
        content:
          "Track every printing plate from receipt to consumption: batch intake, plate optimisation, offcut reuse, waste analytics and production reporting.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Boxes,
    title: "Plate inventory",
    body: "Receive boxes, convert to individual plates, track every unique plate ID and batch.",
  },
  {
    icon: Scissors,
    title: "Optimisation engine",
    body: "Fits finished sizes on 42 x 60 masters, compares rotation and picks the best layout.",
  },
  {
    icon: Recycle,
    title: "Offcut reuse",
    body: "Searches usable offcuts before opening a new plate, cutting material wastage.",
  },
  {
    icon: BarChart3,
    title: "Production reporting",
    body: "Utilisation, waste trend, consumption and traceability reports with export.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-lg font-semibold uppercase tracking-widest">
            PlateWorks
          </span>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          Printing production control
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold uppercase leading-[1.05] tracking-tight">
          Every plate accounted for, from delivery to final offcut
        </h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          PlateWorks manages plate batches, calculates how many master plates a job needs, reuses
          offcuts before opening new stock, and reports on material utilisation across the plant.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/auth">
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} className="kpi-surface border-border/70">
              <CardContent className="space-y-2 p-5">
                <f.icon className="h-5 w-5 text-primary" />
                <h2 className="font-display text-base font-semibold uppercase tracking-wide">
                  {f.title}
                </h2>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
