-- Keep every piece on everyone's wall for good, for now. No age-out job, no age filter on reads.
-- If storage ever gets tight, bring back a cleanup like the one in 20261126000100_muze_art.sql
-- (a pg_cron DELETE on created_at), or thin out older days instead.
select cron.unschedule('muze-art-age-out');

create or replace function public.muze_recent_art(p_limit integer default 30, p_before bigint default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'art', coalesce(jsonb_agg(jsonb_build_object('id', id, 'day', day, 'game', game, 'img', img, 'at', created_at)
                              order by id desc), '[]'::jsonb))
  from (
    select id, day, game, img, created_at from public.muze_art
    where p_before is null or id < p_before
    order by id desc
    limit least(greatest(p_limit, 1), 60)
  ) a
$$;

drop function public.muze_keep_days();
