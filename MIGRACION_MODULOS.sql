-- TRAZA · fase 1: permisos granulares por usuario / contrato / especialidad
-- Ejecutar en Supabase SQL Editor DESPUÉS de respaldar la base de datos.
-- No elimina ni modifica project_members ni otras tablas existentes.
create table if not exists public.project_modules (
  project_id uuid not null references public.projects(id) on delete cascade,
  module_id text not null check (module_id in ('ambiental','avances','documental','prevencion','calidad','topografia','laboratorio','comunidad')),
  enabled boolean not null default false,
  primary key(project_id,module_id)
);
create table if not exists public.project_module_permissions (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null check (module_id in ('ambiental','avances','documental','prevencion','calidad','topografia','laboratorio','comunidad')),
  access_level text not null check (access_level in ('view','edit','approve','admin')),
  primary key(project_id,user_id,module_id),
  foreign key(project_id,module_id) references public.project_modules(project_id,module_id) on delete cascade
);
create index if not exists idx_traza_permissions_user on public.project_module_permissions(user_id,project_id);
alter table public.project_modules enable row level security;
alter table public.project_module_permissions enable row level security;
-- Only members of an active contract may read enabled modules and their own rights.
-- Check memberships here, rather than trusting the client-side project selector.
create policy "project members can list enabled modules" on public.project_modules
  for select to authenticated using (
    exists(select 1 from public.project_members pm
      where pm.project_id = project_modules.project_id and pm.user_id = (select auth.uid())
      and pm.status = 'active'
      and (pm.valid_from is null or pm.valid_from <= current_date)
      and (pm.valid_until is null or pm.valid_until >= current_date))
  );
create policy "members can see own module permissions" on public.project_module_permissions
  for select to authenticated using (
    user_id = (select auth.uid()) and exists(select 1 from public.project_members pm
      where pm.project_id = project_module_permissions.project_id and pm.user_id = (select auth.uid())
      and pm.status = 'active'
      and (pm.valid_from is null or pm.valid_from <= current_date)
      and (pm.valid_until is null or pm.valid_until >= current_date))
  );
-- No insert/update/delete client policies yet: provisioning must be implemented
-- through a reviewed administrative server function, with explicit role checks.
-- Existing members are not automatically given broader permissions.
-- Example for migration of legacy environmental access (review before running):
-- insert into public.project_modules(project_id,module_id,enabled)
-- select distinct project_id,'ambiental',true from public.project_members
-- on conflict(project_id,module_id) do nothing;
-- insert into public.project_module_permissions(project_id,user_id,module_id,access_level)
-- select project_id,user_id,'ambiental',case when role='viewer' then 'view' else 'edit' end
-- from public.project_members where status='active'
-- on conflict(project_id,user_id,module_id) do nothing;
