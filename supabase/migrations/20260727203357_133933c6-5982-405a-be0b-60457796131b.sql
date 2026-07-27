
create type public.app_role as enum ('administrator','production_manager','production_operator','store_keeper','management');
create type public.batch_status as enum ('active','depleted','quarantined');
create type public.plate_status as enum ('available','reserved','partially_used','fully_consumed');
create type public.offcut_status as enum ('available','reserved','used','scrapped');
create type public.job_status as enum ('draft','pending','approved','in_production','completed','cancelled');

create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id
    and role in ('administrator','production_manager','production_operator','store_keeper'));
$$;

create policy "roles readable by authenticated" on public.user_roles for select to authenticated using (true);
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'administrator')) with check (public.has_role(auth.uid(),'administrator'));

-- new user trigger: profile + first user becomes administrator, others operator
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare user_count int;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email);
  select count(*) into user_count from public.user_roles;
  if user_count = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'administrator');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'production_operator');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- reference tables
create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact_person text, phone text, email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, contact_person text, phone text, email text, address text,
  created_at timestamptz not null default now()
);
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null, code text not null unique, location text,
  created_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company text not null, contact_person text, phone text, email text, address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customers_updated_at before update on public.customers for each row execute function public.update_updated_at_column();

create table public.plate_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  manufacturer_id uuid references public.manufacturers(id),
  supplier_id uuid references public.suppliers(id),
  warehouse_id uuid references public.warehouses(id),
  plate_type text not null default 'CTP',
  plate_width numeric not null default 42,
  plate_height numeric not null default 60,
  thickness numeric,
  boxes_received int not null default 0,
  pieces_per_box int not null default 8,
  total_plates int not null default 0,
  available_plates int not null default 0,
  reserved_plates int not null default 0,
  used_plates int not null default 0,
  date_received date not null default current_date,
  purchase_order text,
  cost_per_plate numeric not null default 0,
  status public.batch_status not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plate_batches_updated_at before update on public.plate_batches for each row execute function public.update_updated_at_column();

create sequence public.plate_seq;
create table public.plates (
  id uuid primary key default gen_random_uuid(),
  plate_code text not null unique default 'PLT-' || lpad(nextval('public.plate_seq')::text, 6, '0'),
  batch_id uuid not null references public.plate_batches(id) on delete cascade,
  width numeric not null default 42,
  height numeric not null default 60,
  area numeric generated always as (width * height) stored,
  remaining_area numeric not null default 2520,
  status public.plate_status not null default 'available',
  warehouse_id uuid references public.warehouses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plates_batch_idx on public.plates(batch_id);
create index plates_status_idx on public.plates(status);
create trigger plates_updated_at before update on public.plates for each row execute function public.update_updated_at_column();

create sequence public.offcut_seq;
create table public.offcuts (
  id uuid primary key default gen_random_uuid(),
  offcut_code text not null unique default 'OFC-' || lpad(nextval('public.offcut_seq')::text, 6, '0'),
  parent_plate_id uuid references public.plates(id) on delete set null,
  job_id uuid,
  width numeric not null,
  height numeric not null,
  area numeric generated always as (width * height) stored,
  shape text not null default 'rectangle',
  status public.offcut_status not null default 'available',
  warehouse_id uuid references public.warehouses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offcuts_status_idx on public.offcuts(status);
create trigger offcuts_updated_at before update on public.offcuts for each row execute function public.update_updated_at_column();

create sequence public.job_seq;
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique default 'JOB-' || lpad(nextval('public.job_seq')::text, 5, '0'),
  customer_id uuid references public.customers(id),
  sales_order text,
  product text not null,
  artwork_width numeric not null,
  artwork_height numeric not null,
  quantity int not null default 1,
  margin_top numeric not null default 0,
  margin_bottom numeric not null default 0,
  margin_left numeric not null default 0,
  margin_right numeric not null default 0,
  colours int not null default 1,
  effective_width numeric generated always as (artwork_width + margin_left + margin_right) stored,
  effective_height numeric generated always as (artwork_height + margin_top + margin_bottom) stored,
  due_date date,
  operator_id uuid,
  status public.job_status not null default 'pending',
  plates_required int not null default 0,
  pieces_per_plate int not null default 0,
  rotated boolean not null default false,
  utilization numeric not null default 0,
  waste_area numeric not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create trigger jobs_updated_at before update on public.jobs for each row execute function public.update_updated_at_column();

create table public.plate_allocations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  plate_id uuid references public.plates(id) on delete set null,
  offcut_id uuid references public.offcuts(id) on delete set null,
  source text not null default 'plate',
  pieces_placed int not null default 0,
  used_area numeric not null default 0,
  waste_area numeric not null default 0,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create index plate_allocations_job_idx on public.plate_allocations(job_id);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null,
  reference text,
  batch_id uuid references public.plate_batches(id) on delete set null,
  plate_id uuid references public.plates(id) on delete set null,
  offcut_id uuid references public.offcuts(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  quantity numeric not null default 0,
  notes text,
  performed_by uuid,
  created_at timestamptz not null default now()
);
create index inv_tx_created_idx on public.inventory_transactions(created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  severity text not null default 'info',
  category text not null default 'general',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  device text,
  ip_address text,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- grants + RLS for operational tables
do $$
declare t text;
begin
  foreach t in array array['manufacturers','suppliers','warehouses','customers','plate_batches','plates','offcuts','jobs','plate_allocations','inventory_transactions','notifications','audit_logs','settings']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read for authenticated" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "staff insert" on public.%I for insert to authenticated with check (public.is_staff(auth.uid()))', t);
    execute format('create policy "staff update" on public.%I for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (public.has_role(auth.uid(),''administrator''))', t);
  end loop;
end $$;

grant usage on sequence public.plate_seq to authenticated, service_role;
grant usage on sequence public.offcut_seq to authenticated, service_role;
grant usage on sequence public.job_seq to authenticated, service_role;

insert into public.manufacturers (name, country) values ('Fujifilm','Japan'),('Kodak','USA'),('Agfa','Belgium'),('Huaguang','China');
insert into public.suppliers (name, contact_person, phone) values ('PrintSupply Ltd','James Okoro','+254700111222'),('Graphic World','Ann Mwangi','+254700333444');
insert into public.warehouses (name, code, location) values ('Main Store','WH-MAIN','Plant A'),('Production Floor','WH-PROD','Plant A');
insert into public.customers (company, contact_person, phone, email) values
 ('Acme Packaging','Peter Kimani','+254711000111','peter@acmepack.com'),
 ('Bright Labels Ltd','Grace Wanjiru','+254722000222','grace@brightlabels.com');
