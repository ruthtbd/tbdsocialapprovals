-- Run this in your Supabase SQL editor

create table if not exists campaigns (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  client_name text,
  token text unique not null,
  created_at timestamp with time zone default now(),
  approved_at timestamp with time zone
);

-- Posts are containers (caption, date, platform, status)
-- Assets hold the actual files (1 = single post, 2-5 = carousel)
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references campaigns(id) on delete cascade,
  caption text,
  platform text,
  scheduled_date date,
  position integer default 0,
  status text default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  feedback text,
  created_at timestamp with time zone default now()
);

create table if not exists post_assets (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  file_url text not null,
  file_type text not null check (file_type in ('image', 'video')),
  position integer default 0,
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table campaigns enable row level security;
alter table posts enable row level security;
alter table post_assets enable row level security;

-- Drop then recreate policies (safe to re-run)
drop policy if exists "Allow all on campaigns" on campaigns;
drop policy if exists "Allow all on posts" on posts;
drop policy if exists "Allow all on post_assets" on post_assets;
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public reads" on storage.objects;
drop policy if exists "Allow public deletes" on storage.objects;

create policy "Allow all on campaigns" on campaigns for all using (true) with check (true);
create policy "Allow all on posts" on posts for all using (true) with check (true);
create policy "Allow all on post_assets" on post_assets for all using (true) with check (true);

-- Storage bucket
insert into storage.buckets (id, name, public) values ('posts', 'posts', true)
on conflict (id) do nothing;

create policy "Allow public uploads" on storage.objects for insert
  with check (bucket_id = 'posts');
create policy "Allow public reads" on storage.objects for select
  using (bucket_id = 'posts');
create policy "Allow public deletes" on storage.objects for delete
  using (bucket_id = 'posts');
