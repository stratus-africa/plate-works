/**
 * Machine (printer/press) configuration.
 *
 * Each machine defines the reserved clamp margin (inches on every edge) that
 * the press grips onto. The list is stored in the `settings` table under the
 * `machines` key so administrators can maintain it from Settings without a
 * schema change, and every new nesting calculation reads the margin from the
 * machine selected for the job.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CLAMP_MARGIN } from "@/lib/optimizer";

export interface Machine {
  id: string;
  name: string;
  /** Reserved clamp band per edge, in inches. */
  clampMargin: number;
  isDefault?: boolean;
}

export const MACHINES_SETTING_KEY = "machines";

export const DEFAULT_MACHINES: Machine[] = [
  { id: "default-press", name: "Default press", clampMargin: CLAMP_MARGIN, isDefault: true },
];

export function parseMachines(value: unknown): Machine[] {
  if (!Array.isArray(value)) return DEFAULT_MACHINES;
  const list = value
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m, i) => ({
      id: String(m.id ?? `machine-${i}`),
      name: String(m.name ?? "Unnamed machine"),
      clampMargin: Math.max(0, Number(m.clampMargin ?? CLAMP_MARGIN) || 0),
      isDefault: m.isDefault === true,
    }));
  if (list.length === 0) return DEFAULT_MACHINES;
  if (!list.some((m) => m.isDefault)) list[0].isDefault = true;
  return list;
}

export async function fetchMachines(): Promise<Machine[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", MACHINES_SETTING_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseMachines(data?.value);
}

export async function saveMachines(machines: Machine[]) {
  const { error } = await supabase
    .from("settings")
    .upsert(
      { key: MACHINES_SETTING_KEY, value: machines as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
}

export function useMachines() {
  return useQuery({ queryKey: ["machines"], queryFn: fetchMachines });
}

export function defaultMachine(machines: Machine[] | undefined): Machine {
  const list = machines?.length ? machines : DEFAULT_MACHINES;
  return list.find((m) => m.isDefault) ?? list[0];
}

/** Clamp margin for a machine id, falling back to the default machine. */
export function clampMarginFor(machines: Machine[] | undefined, machineId?: string | null): number {
  const list = machines?.length ? machines : DEFAULT_MACHINES;
  const found = machineId ? list.find((m) => m.id === machineId || m.name === machineId) : undefined;
  return (found ?? defaultMachine(list)).clampMargin;
}
