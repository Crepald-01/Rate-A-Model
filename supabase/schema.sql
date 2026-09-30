-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.ratings (
  model_id   text        not null,
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  user_name  text        not null default 'User',
  stars      int         not null check (stars between 1 and 5),
  review     text        not null default '' check (char_length(review) <= 500),
  updated_at timestamptz not null default now(),
  primary key (model_id, user_id)
);

alter table public.ratings enable row level security;

create policy "anyone can read ratings" on public.ratings for select using (true);
create policy "users insert own rating" on public.ratings for insert with check (auth.uid() = user_id);
create policy "users update own rating" on public.ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own rating" on public.ratings for delete using (auth.uid() = user_id);

-- Aggregates the site reads
create or replace view public.model_stats as
  select model_id,
         count(*)::int as n,
         avg(stars)::float8 as avg,
         count(*) filter (where stars = 1)::int as d1,
         count(*) filter (where stars = 2)::int as d2,
         count(*) filter (where stars = 3)::int as d3,
         count(*) filter (where stars = 4)::int as d4,
         count(*) filter (where stars = 5)::int as d5
  from public.ratings group by model_id;

create or replace view public.site_totals as
  select count(*)::int as ratings, count(distinct user_id)::int as raters from public.ratings;

grant select on public.model_stats, public.site_totals to anon, authenticated;
