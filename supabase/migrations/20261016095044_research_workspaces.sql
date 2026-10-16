-- No-login, per-browser workspace storage. The random capability is supplied in
-- X-Workspace-Token, never in URLs. Only its SHA-256 hash is stored.
create or replace function public.zntx_workspace_hash()
returns text language sql stable security invoker
set search_path = ''
as $$
  select case
    when (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-workspace-token') ~ '^[a-f0-9]{64}$'
    then pg_catalog.encode(extensions.digest(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-workspace-token',
      'sha256'), 'hex')
    else null
  end
$$;
revoke all on function public.zntx_workspace_hash() from public;
grant execute on function public.zntx_workspace_hash() to anon, authenticated;

create table if not exists public.zntx_records (
  workspace_hash text not null default public.zntx_workspace_hash(),
  collection text not null check (collection in ('papers','searches','drafts','projects','chats','notes','reviews','agents')),
  id text not null check (char_length(id) between 1 and 512),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1048576),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_hash, collection, id)
);
create index if not exists zntx_records_recent_idx
  on public.zntx_records (workspace_hash, collection, updated_at desc);
alter table public.zntx_records enable row level security;
alter table public.zntx_records force row level security;
revoke all on public.zntx_records from public;
grant select, insert, update, delete on public.zntx_records to anon, authenticated;
create policy zntx_browser_workspace on public.zntx_records
  for all to anon, authenticated
  using (workspace_hash = (select public.zntx_workspace_hash()))
  with check (workspace_hash = (select public.zntx_workspace_hash()));
comment on table public.zntx_records is 'No-login research workspaces isolated by a 256-bit browser capability and RLS. Losing the capability loses access; export backups.';
