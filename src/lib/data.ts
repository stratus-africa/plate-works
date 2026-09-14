/** Shared query helpers built on the browser Supabase client (RLS enforced). */
import { supabase } from "@/integrations/supabase/client";

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function fetchDashboard() {
  const today = startOfToday();

  const [plates, offcuts, jobs, batches, txToday, workTickets, workTicketItems] = await Promise.all([
    supabase.from("plates").select("id,status,remaining_area,area,created_at,batch_id"),
    supabase.from("offcuts").select("id,status,area,created_at"),
    supabase
      .from("jobs")
      .select("id,status,plates_required,utilization,waste_area,created_at,completed_at,customer_id"),
    supabase
      .from("plate_batches")
      .select(
        "id,batch_number,total_plates,available_plates,used_plates,reserved_plates,date_received,manufacturer_id,plate_type,cost_per_plate,manufacturers(name)",
      ),
    supabase.from("inventory_transactions").select("id,transaction_type,quantity,created_at").gte("created_at", today),
    supabase
      .from("work_tickets")
      .select("id,work_ticket_number,status,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("work_ticket_items").select("id,work_ticket_id,item_name,quantity,completed_quantity"),
  ]);

  return {
    plates: plates.data ?? [],
    offcuts: offcuts.data ?? [],
    jobs: jobs.data ?? [],
    batches: batches.data ?? [],
    transactionsToday: txToday.data ?? [],
    workTickets: workTickets.data ?? [],
    workTicketItems: workTicketItems.data ?? [],
  };
}

export async function logTransaction(payload: {
  transaction_type: string;
  quantity?: number;
  reference?: string;
  batch_id?: string | null;
  plate_id?: string | null;
  offcut_id?: string | null;
  job_id?: string | null;
  warehouse_id?: string | null;
  notes?: string | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("inventory_transactions").insert({
    ...payload,
    performed_by: userData.user?.id ?? null,
  });
}

export async function notify(
  title: string,
  body: string,
  severity: "info" | "warning" | "critical" | "success" = "info",
  category = "general",
) {
  await supabase.from("notifications").insert({ title, body, severity, category });
}

export async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  oldValue: unknown,
  newValue: unknown,
) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    user_id: userData.user?.id ?? null,
    action,
    entity,
    entity_id: entityId,
    old_value: (oldValue ?? null) as never,
    new_value: (newValue ?? null) as never,
    device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
  });
}
