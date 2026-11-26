-- Guests no longer upload anything: their pieces stay on the device. Only signed-in users
-- (Supabase Auth, role `authenticated`) may insert. Applied together with the Puzz half as `no_guest_writes`.
revoke insert on public.muze_art from anon;
drop policy muze_art_insert on public.muze_art;
create policy muze_art_insert on public.muze_art
  for insert to authenticated
  with check (day between current_date - 1 and current_date + 1 and private.muze_art_room());
revoke execute on function private.muze_art_room() from anon;
