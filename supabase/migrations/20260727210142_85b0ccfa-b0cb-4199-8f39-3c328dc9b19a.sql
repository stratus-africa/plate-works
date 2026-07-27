create type public.cycle_count_status as enum ('draft','in_progress','completed','cancelled');

create table public.cycle_counts (
  id uuid primary key default gen_random_uuid(),
  reference text not null default ('CC-' || to_char(now(),'YYMMDD') || '-' || lpad(floor(random()*10000)::text,4,'0')),
  warehouse_id uuid references public.warehouses(id),
  scope text not null default 'all',
  status public.cycle_count_status not null default 'in_progress',
  notes text,
  counted_by uuid,
  expected_count integer not null default 0,
  counted_count integer not null default 0,
  discrepancy_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.cycle_counts to authenticated;
grant all on public.cycle_counts to service_role;
alter table public.cycle_counts enable row level security;
create policy "read for authenticated" on public.cycle_counts for select to authenticated using (true);
create policy "staff insert" on public.cycle_counts for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "staff update" on public.cycle_counts for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin delete" on public.cycle_counts for delete to authenticated using (public.has_role(auth.uid(),'administrator'));

create table public.cycle_count_lines (
  id uuid primary key default gen_random_uuid(),
  cycle_count_id uuid not null references public.cycle_counts(id) on delete cascade,
  item_type text not null default 'plate',
  plate_id uuid references public.plates(id) on delete cascade,
  offcut_id uuid references public.offcuts(id) on delete cascade,
  item_code text not null default '',
  expected_status text,
  expected_warehouse_id uuid references public.warehouses(id),
  counted boolean not null default false,
  counted_status text,
  counted_warehouse_id uuid references public.warehouses(id),
  discrepancy boolean not null default false,
  discrepancy_type text,
  resolved boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cycle_count_lines_count_idx on public.cycle_count_lines(cycle_count_id);
grant select, insert, update, delete on public.cycle_count_lines to authenticated;
grant all on public.cycle_count_lines to service_role;
alter table public.cycle_count_lines enable row level security;
create policy "read for authenticated" on public.cycle_count_lines for select to authenticated using (true);
create policy "staff insert" on public.cycle_count_lines for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "staff update" on public.cycle_count_lines for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin delete" on public.cycle_count_lines for delete to authenticated using (public.has_role(auth.uid(),'administrator'));

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  item_type text not null default 'plate',
  plate_id uuid references public.plates(id) on delete set null,
  offcut_id uuid references public.offcuts(id) on delete set null,
  item_code text not null default '',
  from_warehouse_id uuid references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  reason text,
  performed_by uuid,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.stock_transfers to authenticated;
grant all on public.stock_transfers to service_role;
alter table public.stock_transfers enable row level security;
create policy "read for authenticated" on public.stock_transfers for select to authenticated using (true);
create policy "staff insert" on public.stock_transfers for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "staff update" on public.stock_transfers for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin delete" on public.stock_transfers for delete to authenticated using (public.has_role(auth.uid(),'administrator'));

create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_type text not null default 'plate',
  plate_id uuid references public.plates(id) on delete set null,
  offcut_id uuid references public.offcuts(id) on delete set null,
  item_code text not null default '',
  adjustment_type text not null default 'status',
  old_status text,
  new_status text,
  old_warehouse_id uuid references public.warehouses(id),
  new_warehouse_id uuid references public.warehouses(id),
  cycle_count_id uuid references public.cycle_counts(id) on delete set null,
  reason text,
  performed_by uuid,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.inventory_adjustments to authenticated;
grant all on public.inventory_adjustments to service_role;
alter table public.inventory_adjustments enable row level security;
create policy "read for authenticated" on public.inventory_adjustments for select to authenticated using (true);
create policy "staff insert" on public.inventory_adjustments for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "staff update" on public.inventory_adjustments for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin delete" on public.inventory_adjustments for delete to authenticated using (public.has_role(auth.uid(),'administrator'));

create trigger update_cycle_counts_updated_at before update on public.cycle_counts
  for each row execute function public.update_updated_at_column();
create trigger update_cycle_count_lines_updated_at before update on public.cycle_count_lines
  for each row execute function public.update_updated_at_column();