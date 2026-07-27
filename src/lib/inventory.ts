/** Shared helpers for barcode/QR lookups and warehouse inventory movements. */
import { supabase } from "@/integrations/supabase/client";

export type ScannedKind = "plate" | "offcut" | "job";

export interface ScanResult {
  kind: ScannedKind;
  code: string;
  id: string;
  record: Record<string, unknown> & { id: string };
}

/** Normalises a scanned payload — QR codes may embed a URL or `kind:code` pair. */
export function normalizeScannedCode(raw: string): string {
  const value = raw.trim();
  const fromUrl = value.split("/").pop() ?? value;
  const cleaned = fromUrl.split("?")[0].split(":").pop() ?? fromUrl;
  return cleaned.trim().toUpperCase();
}

/** Resolves a scanned code to a plate, offcut or job record. */
export async function lookupCode(raw: string): Promise<ScanResult | null> {
  const code = normalizeScannedCode(raw);

  const plate = await supabase
    .from("plates")
    .select("*, plate_batches(batch_number, plate_type), warehouses(name, code)")
    .eq("plate_code", code)
    .maybeSingle();
  if (plate.data) return { kind: "plate", code, id: plate.data.id, record: plate.data };

  const offcut = await supabase
    .from("offcuts")
    .select("*, warehouses(name, code)")
    .eq("offcut_code", code)
    .maybeSingle();
  if (offcut.data) return { kind: "offcut", code, id: offcut.data.id, record: offcut.data };

  const job = await supabase
    .from("jobs")
    .select("*, customers(company)")
    .eq("job_number", code)
    .maybeSingle();
  if (job.data) return { kind: "job", code, id: job.data.id, record: job.data };

  return null;
}

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
