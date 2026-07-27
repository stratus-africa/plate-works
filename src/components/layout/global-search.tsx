import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Global search across jobs, customers, plates, batches and offcuts. */
export function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const { data } = useQuery({
    queryKey: ["global-search", term],
    enabled: open && term.length > 1,
    queryFn: async () => {
      const like = `%${term}%`;
      const [jobs, customers, plates, batches, offcuts] = await Promise.all([
        supabase
          .from("jobs")
          .select("id,job_number,product,sales_order")
          .or(`job_number.ilike.${like},product.ilike.${like},sales_order.ilike.${like}`)
          .limit(5),
        supabase.from("customers").select("id,company").ilike("company", like).limit(5),
        supabase.from("plates").select("id,plate_code").ilike("plate_code", like).limit(5),
        supabase
          .from("plate_batches")
          .select("id,batch_number")
          .ilike("batch_number", like)
          .limit(5),
        supabase.from("offcuts").select("id,offcut_code").ilike("offcut_code", like).limit(5),
      ]);
      return {
        jobs: jobs.data ?? [],
        customers: customers.data ?? [],
        plates: plates.data ?? [],
        batches: batches.data ?? [],
        offcuts: offcuts.data ?? [],
      };
    },
  });

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search jobs, customers, plates, batches, offcuts…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
        {data?.jobs.length ? (
          <CommandGroup heading="Jobs">
            {data.jobs.map((j) => (
              <CommandItem key={j.id} onSelect={() => go(`/jobs/${j.id}`)}>
                {j.job_number} — {j.product}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {data?.customers.length ? (
          <CommandGroup heading="Customers">
            {data.customers.map((c) => (
              <CommandItem key={c.id} onSelect={() => go("/customers")}>
                {c.company}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {data?.batches.length ? (
          <CommandGroup heading="Batches">
            {data.batches.map((b) => (
              <CommandItem key={b.id} onSelect={() => go("/inventory")}>
                {b.batch_number}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {data?.plates.length ? (
          <CommandGroup heading="Plates">
            {data.plates.map((p) => (
              <CommandItem key={p.id} onSelect={() => go("/plates")}>
                {p.plate_code}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {data?.offcuts.length ? (
          <CommandGroup heading="Offcuts">
            {data.offcuts.map((o) => (
              <CommandItem key={o.id} onSelect={() => go("/offcuts")}>
                {o.offcut_code}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
