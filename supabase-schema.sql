-- Run this in your Supabase SQL editor
-- Safe to re-run: uses CREATE IF NOT EXISTS and DROP IF EXISTS patterns

-- ─── campaigns ────────────────────────────────────────────────────────────────
create table if not exists campaigns (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  client_name text,
  token text unique not null,
  status text default 'draft' check (status in ('draft', 'active')),
  created_at timestamp with time zone default now(),
  approved_at timestamp with time zone
);

-- ─── posts ────────────────────────────────────────────────────────────────────
-- Posts are containers (caption, date, platform, status)
-- Assets hold the actual files (1 = single post, 2-5 = carousel)
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references campaigns(id) on delete cascade,
  caption text,
  platform text,
  scheduled_date date,
  position integer default 0,
  status text check (status in ('approved', 'changes_requested', 'rejected')),
  feedback text,
  created_at timestamp with time zone default now()
);

-- Migrate existing 'pending' values to null and update constraint
-- (safe to re-run)
alter table posts drop constraint if exists posts_status_check;
update posts set status = null where status = 'pending';
alter table posts alter column status drop default;
alter table posts add constraint posts_status_check
  check (status is null or status in ('approved', 'changes_requested', 'rejected'));

-- ─── post_assets ──────────────────────────────────────────────────────────────
create table if not exists post_assets (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  file_url text not null,
  file_type text not null check (file_type in ('image', 'video')),
  thumbnail_url text,
  position integer default 0,
  crop_x real default 50,
  crop_y real default 50,
  created_at timestamp with time zone default now()
);

-- Add crop columns if upgrading from older schema (safe to re-run)
alter table post_assets add column if not exists crop_x real default 50;
alter table post_assets add column if not exists crop_y real default 50;

-- Track when a post has been marked as scheduled (admin-only flag)
alter table posts add column if not exists scheduled_at timestamp with time zone;

-- Soft delete — set deleted_at instead of removing rows, so a 30-day undo is possible.
alter table campaigns add column if not exists deleted_at timestamp with time zone;
alter table posts add column if not exists deleted_at timestamp with time zone;

-- Multi-client approvers per campaign — each reviewer has an email, signs in via magic link
-- at /review, sees campaigns where their email is listed, and their approvals are tracked
-- per-reviewer. A post is "fully approved" when every reviewer assigned to its campaign has
-- approved it (computed in the admin UI, since there can be any number of approvers).
alter table reviewers add column if not exists email text;
create index if not exists reviewers_email_idx on reviewers(lower(email));

-- ─── reviewers ────────────────────────────────────────────────────────────────
-- Each reviewer has a unique token; their /review/[token] link is personal
create table if not exists reviewers (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references campaigns(id) on delete cascade,
  name text not null,
  token text unique not null,
  created_at timestamp with time zone default now()
);

create index if not exists reviewers_campaign_id_idx on reviewers(campaign_id);
create index if not exists reviewers_token_idx on reviewers(token);

-- ─── post_reviews ─────────────────────────────────────────────────────────────
-- One row per (post, reviewer) — upserted on conflict, never overwrites others
create table if not exists post_reviews (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  reviewer_id uuid references reviewers(id) on delete cascade,
  status text check (status in ('approved', 'changes_requested', 'rejected')),
  feedback text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(post_id, reviewer_id)
);

-- Migrate existing 'pending' values to null in post_reviews
alter table post_reviews drop constraint if exists post_reviews_status_check;
update post_reviews set status = null where status = 'pending';
alter table post_reviews alter column status drop default;
alter table post_reviews add constraint post_reviews_status_check
  check (status is null or status in ('approved', 'changes_requested', 'rejected'));

create index if not exists post_reviews_post_id_idx on post_reviews(post_id);
create index if not exists post_reviews_reviewer_id_idx on post_reviews(reviewer_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table campaigns enable row level security;
alter table posts enable row level security;
alter table post_assets enable row level security;
alter table reviewers enable row level security;
alter table post_reviews enable row level security;

-- Drop then recreate policies (safe to re-run)
drop policy if exists "Allow all on campaigns" on campaigns;
drop policy if exists "Allow all on posts" on posts;
drop policy if exists "Allow all on post_assets" on post_assets;
drop policy if exists "Allow all on reviewers" on reviewers;
drop policy if exists "Allow all on post_reviews" on post_reviews;
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public reads" on storage.objects;
drop policy if exists "Allow public deletes" on storage.objects;

create policy "Allow all on campaigns" on campaigns for all using (true) with check (true);
create policy "Allow all on posts" on posts for all using (true) with check (true);
create policy "Allow all on post_assets" on post_assets for all using (true) with check (true);
create policy "Allow all on reviewers" on reviewers for all using (true) with check (true);
create policy "Allow all on post_reviews" on post_reviews for all using (true) with check (true);

-- ─── Storage bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('posts', 'posts', true)
on conflict (id) do nothing;

create policy "Allow public uploads" on storage.objects for insert
  with check (bucket_id = 'posts');
create policy "Allow public reads" on storage.objects for select
  using (bucket_id = 'posts');
create policy "Allow public deletes" on storage.objects for delete
  using (bucket_id = 'posts');
