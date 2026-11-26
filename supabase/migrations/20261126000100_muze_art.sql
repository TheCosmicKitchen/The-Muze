-- The Muze: everyone's finished pieces from the last few days.
-- When a daily piece lands in someone's gallery, the browser also sends a small JPEG of it here.
-- No accounts: a row is just day, which make, the picture and when it arrived.
-- Browsers may only INSERT. They read through muze_recent_art(), which only returns recent pieces,
-- and a pg_cron job deletes anything older, so storage stays bounded.
--
-- Why a picture and not the source data: every make draws differently (strokes, word picks, pixels,
-- cut-outs, a 3D vale), and the gallery already reduces all of them to one image. Replaying source
-- data would need a renderer per make kept in step with the pages. A JPEG of at most 480 px is
-- about 15-40 KB, and it lives in a plain text column rather than Supabase Storage so the age-out
-- is one DELETE (Storage files can't be removed from SQL) and there are no bucket policies to keep.

create extension if not exists pg_cron;

-- k: how many days of art to keep. The only place it's set; the read function and the cleanup use it.
create function public.muze_keep_days() returns integer
language sql immutable set search_path = '' as $$ select 7 $$;

create table public.muze_art (
  id         bigint generated always as identity primary key,
  day        date not null,
  game       text not null check (game ~ '^[a-z]{2,16}$'),
  img        text not null check (length(img) <= 60000 and img ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'),
  created_at timestamptz not null default now()
);
create index muze_art_created on public.muze_art (created_at desc);

alter table public.muze_art enable row level security;
revoke all on public.muze_art from anon, authenticated;
grant insert on public.muze_art to anon, authenticated;

-- Room left today? Caps the table at about 800 pieces a day (~7 x 800 x 60 KB worst case, inside the
-- free plan's 500 MB) so a flood of uploads can't fill the database.
create function public.muze_art_room() returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < 800 from public.muze_art where created_at > now() - interval '1 day'
$$;
revoke execute on function public.muze_art_room() from public;
grant execute on function public.muze_art_room() to anon, authenticated;

create policy muze_art_insert on public.muze_art
  for insert to anon, authenticated
  with check (day between current_date - 1 and current_date + 1 and public.muze_art_room());

-- Newest first, at most 60 at a time; pass p_before (an id) for the next page.
create function public.muze_recent_art(p_limit integer default 30, p_before bigint default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'days', public.muze_keep_days(),
    'art', coalesce(jsonb_agg(jsonb_build_object('id', id, 'day', day, 'game', game, 'img', img, 'at', created_at)
                              order by id desc), '[]'::jsonb))
  from (
    select id, day, game, img, created_at from public.muze_art
    where created_at > now() - make_interval(days => public.muze_keep_days())
      and (p_before is null or id < p_before)
    order by id desc
    limit least(greatest(p_limit, 1), 60)
  ) a
$$;
revoke execute on function public.muze_recent_art(integer, bigint) from public;
grant execute on function public.muze_recent_art(integer, bigint) to anon, authenticated;

-- Age-out: every 15 minutes, delete pieces older than k days.
select cron.schedule('muze-art-age-out', '*/15 * * * *',
  $$delete from public.muze_art where created_at < now() - make_interval(days => public.muze_keep_days())$$);
