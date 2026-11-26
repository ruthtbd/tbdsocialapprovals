-- ─────────────────────────────────────────────────────────────────────────────
-- Production RLS lockdown — run this in Supabase SQL Editor AFTER the latest
-- Vercel deploy has rolled out. Reviewers lose direct UPDATE on posts; the
-- trigger below keeps posts.status aggregated from post_reviews.
--
-- All existing campaigns, posts, assets, and approvals are PRESERVED — this
-- only changes who can see and write what, not what is stored.
-- ─────────────────────────────────────────────────────────────────────────────

-- Make sure the email index exists (from earlier migration; safe to re-run)
alter table reviewers add column if not exists email text;
create index if not exists reviewers_email_idx on reviewers(lower(email));

-- ─── Helpers ──────────────────────────────────────────────────────────────────

-- Admin check — reads is_admin from JWT app_metadata (set in Supabase Auth → Users)
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
$$;

-- Does the current user's email appear in the reviewers table for a given campaign?
create or replace function public.is_reviewer_of_campaign(c_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reviewers r
    where r.campaign_id = c_id
      and lower(r.email) = lower(auth.jwt() ->> 'email')
  )
$$;

-- All campaign ids the current user is a reviewer on (for IN clauses)
create or replace function public.my_campaign_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select campaign_id from reviewers
  where lower(email) = lower(auth.jwt() ->> 'email')
$$;

-- ─── Drop all legacy "allow all" policies (including duplicates) ──────────────

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('campaigns','posts','post_assets','reviewers','post_reviews')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ─── campaigns ───────────────────────────────────────────────────────────────

alter table campaigns enable row level security;

create policy campaigns_admin_all on campaigns
  for all to authenticated using (is_admin()) with check (is_admin());

create policy campaigns_reviewer_select on campaigns
  for select to authenticated
  using (not is_admin() and is_reviewer_of_campaign(id));

-- ─── posts ───────────────────────────────────────────────────────────────────

alter table posts enable row level security;

create policy posts_admin_all on posts
  for all to authenticated using (is_admin()) with check (is_admin());

create policy posts_reviewer_select on posts
  for select to authenticated
  using (not is_admin() and campaign_id in (select my_campaign_ids()));

-- (no reviewer INSERT/UPDATE/DELETE on posts — the trigger below keeps status in sync)

-- ─── post_assets ─────────────────────────────────────────────────────────────

alter table post_assets enable row level security;

create policy post_assets_admin_all on post_assets
  for all to authenticated using (is_admin()) with check (is_admin());

create policy post_assets_reviewer_select on post_assets
  for select to authenticated
  using (not is_admin() and post_id in (
    select id from posts where campaign_id in (select my_campaign_ids())
  ));

-- ─── reviewers ───────────────────────────────────────────────────────────────

alter table reviewers enable row level security;

create policy reviewers_admin_all on reviewers
  for all to authenticated using (is_admin()) with check (is_admin());

-- Reviewers can see their own row AND co-approvers on the same campaign
create policy reviewers_select_peers on reviewers
  for select to authenticated
  using (not is_admin() and campaign_id in (select my_campaign_ids()));

-- ─── post_reviews ────────────────────────────────────────────────────────────

alter table post_reviews enable row level security;

create policy post_reviews_admin_all on post_reviews
  for all to authenticated using (is_admin()) with check (is_admin());

-- Reviewers can see all votes on any post in a campaign they're on (for peer visibility)
create policy post_reviews_reviewer_select on post_reviews
  for select to authenticated
  using (not is_admin() and post_id in (
    select id from posts where campaign_id in (select my_campaign_ids())
  ));

-- Reviewers can insert/update only their OWN vote, and only for posts in their campaigns
create policy post_reviews_reviewer_insert on post_reviews
  for insert to authenticated
  with check (
    not is_admin()
    and reviewer_id in (
      select id from reviewers where lower(email) = lower(auth.jwt() ->> 'email')
    )
    and post_id in (
      select id from posts where campaign_id in (select my_campaign_ids())
    )
  );

create policy post_reviews_reviewer_update on post_reviews
  for update to authenticated
  using (
    not is_admin()
    and reviewer_id in (
      select id from reviewers where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    reviewer_id in (
      select id from reviewers where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ─── Aggregate trigger: posts.status reflects post_reviews ───────────────────
-- Rules: any reviewer 'rejected' → post 'rejected';
--        else any 'changes_requested' → post 'changes_requested';
--        else if every assigned reviewer has 'approved' → post 'approved';
--        else → null (pending).
-- Runs as the function definer, bypassing RLS on posts so reviewers can
-- indirectly trigger a status update without having UPDATE on posts.

create or replace function public.recompute_post_status() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  target_post_id uuid;
  target_campaign uuid;
  reviewer_count int;
  approved_count int;
  rejected_feedback text;
  changes_feedback text;
  new_status text;
  new_feedback text;
begin
  target_post_id := coalesce(new.post_id, old.post_id);
  select campaign_id into target_campaign from posts where id = target_post_id;
  if target_campaign is null then
    return coalesce(new, old);
  end if;

  select count(*) into reviewer_count from reviewers where campaign_id = target_campaign;

  select pr.feedback into rejected_feedback
    from post_reviews pr join reviewers r on r.id = pr.reviewer_id
    where pr.post_id = target_post_id and r.campaign_id = target_campaign and pr.status = 'rejected'
    order by pr.updated_at desc nulls last limit 1;

  select pr.feedback into changes_feedback
    from post_reviews pr join reviewers r on r.id = pr.reviewer_id
    where pr.post_id = target_post_id and r.campaign_id = target_campaign and pr.status = 'changes_requested'
    order by pr.updated_at desc nulls last limit 1;

  select count(distinct pr.reviewer_id) into approved_count
    from post_reviews pr join reviewers r on r.id = pr.reviewer_id
    where pr.post_id = target_post_id and r.campaign_id = target_campaign and pr.status = 'approved';

  if rejected_feedback is not null or exists (
    select 1 from post_reviews pr join reviewers r on r.id = pr.reviewer_id
    where pr.post_id = target_post_id and r.campaign_id = target_campaign and pr.status = 'rejected'
  ) then
    new_status := 'rejected'; new_feedback := rejected_feedback;
  elsif exists (
    select 1 from post_reviews pr join reviewers r on r.id = pr.reviewer_id
    where pr.post_id = target_post_id and r.campaign_id = target_campaign and pr.status = 'changes_requested'
  ) then
    new_status := 'changes_requested'; new_feedback := changes_feedback;
  elsif reviewer_count > 0 and approved_count = reviewer_count then
    new_status := 'approved'; new_feedback := null;
  else
    new_status := null; new_feedback := null;
  end if;

  update posts set status = new_status, feedback = new_feedback where id = target_post_id;
  return coalesce(new, old);
end $$;

drop trigger if exists post_reviews_aggregate on post_reviews;
create trigger post_reviews_aggregate
  after insert or update or delete on post_reviews
  for each row execute function public.recompute_post_status();

-- ─── Storage bucket: tighten writes, keep public reads ───────────────────────
-- Reads stay public so media displays in the app and in email thumbnails.
-- Writes (insert/delete) become admin-only.

drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public deletes" on storage.objects;
-- "Allow public reads" is left in place on purpose.

create policy "Admins can upload to posts bucket" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posts' and is_admin());

-- UPDATE is needed because the app uses upsert:true for thumbnails and asset replaces.
create policy "Admins can update posts bucket" on storage.objects
  for update to authenticated
  using (bucket_id = 'posts' and is_admin())
  with check (bucket_id = 'posts' and is_admin());

create policy "Admins can delete from posts bucket" on storage.objects
  for delete to authenticated
  using (bucket_id = 'posts' and is_admin());
