create table public.ai_analysis_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_kind text not null check (analysis_kind in ('genre')),
  created_at timestamptz not null default now()
);

create index ai_analysis_events_user_created_at_idx
  on public.ai_analysis_events (user_id, created_at desc);

alter table public.ai_analysis_events enable row level security;

create policy "ai_analysis_events_select_own"
on public.ai_analysis_events for select to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_analysis_events_insert_own"
on public.ai_analysis_events for insert to authenticated
with check ((select auth.uid()) = user_id);

grant select, insert on public.ai_analysis_events to authenticated;
revoke all on public.ai_analysis_events from anon;
