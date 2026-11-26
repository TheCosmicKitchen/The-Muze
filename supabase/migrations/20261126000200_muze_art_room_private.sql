-- muze_art_room() is only for the insert policy, so it moves out of `public` into a schema the REST API
-- doesn't expose. Browsers can still evaluate it inside the policy, but can't call it as /rpc/.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create function private.muze_art_room() returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < 800 from public.muze_art where created_at > now() - interval '1 day'
$$;
revoke execute on function private.muze_art_room() from public;
grant execute on function private.muze_art_room() to anon, authenticated;

drop policy muze_art_insert on public.muze_art;
create policy muze_art_insert on public.muze_art
  for insert to anon, authenticated
  with check (day between current_date - 1 and current_date + 1 and private.muze_art_room());

drop function public.muze_art_room();
