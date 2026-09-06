begin;

/* TRAINING PARTNERS, NOT FOLLOWERS.

   Forge's social surface is deliberately not a feed. A feed changes what an
   athlete logs — the top set stops being honest evidence and starts being a
   post — and the coach programs from that evidence. What two people on Forge
   share that no other app can give them is a POSITION: both are somewhere in a
   ten-week block, on a rung of the same 8/6/4/2/1 wave. That is the unit here.

   Everything below returns structured training numbers only. No free text ever
   crosses between athletes, which keeps this out of App Store Guideline 1.2's
   user-generated-content obligations entirely. */

/* One row per accepted partner: where they are in their block, whether they
   have trained today, and the single heaviest set if they have. Security
   definer because it deliberately reads another athlete's rows — and it only
   ever reads them through an ACCEPTED friendship with the caller. */
create or replace function public.forge_partner_feed()
returns table (
  friend_id uuid,
  username text,
  display_name text,
  block_week int,
  block_weeks int,
  wave_slot int,
  trained_today boolean,
  last_trained date,
  top_lift text,
  top_weight numeric,
  top_reps int,
  cardio_summary text
)
language sql
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  partners as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f, me
    where f.status = 'accepted' and me.id in (f.requester_id, f.addressee_id)
  ),
  today as (
    select p.friend_id, d.id as day_id, d.workout_date
    from partners p
    join public.workout_days d on d.owner_id = p.friend_id and d.workout_date = current_date
  ),
  /* The heaviest set of their day, ranked by the same curve the app uses:
     Brzycki, capped at ten reps. */
  best as (
    select distinct on (t.friend_id)
      t.friend_id, s.lift_name, s.weight, s.reps::int as reps
    from today t
    join public.top_sets s on s.workout_day_id = t.day_id
    where s.weight > 0 and s.reps > 0
    order by t.friend_id,
      s.weight * (36.0 / (37 - least(greatest(round(s.reps), 1), 10))) desc
  ),
  cardio as (
    select distinct on (t.friend_id) t.friend_id, c.summary
    from today t
    join public.cardio_sessions c on c.workout_day_id = t.day_id
    order by t.friend_id, c.created_at desc nulls last
  ),
  latest as (
    select p.friend_id, max(d.workout_date) as last_trained
    from partners p
    join public.workout_days d on d.owner_id = p.friend_id
    group by p.friend_id
  ),
  block as (
    select p.friend_id,
      greatest(1, least(
        jsonb_array_length(tp.payload -> 'plan' -> 'weeks'),
        1 + floor((current_date - (tp.payload ->> 'startDate')::date) / 7)::int
      )) as block_week,
      jsonb_array_length(tp.payload -> 'plan' -> 'weeks') as block_weeks,
      coalesce((tp.payload ->> 'waveOffset')::int, 0) as wave_offset,
      (tp.payload ->> 'startDate')::date as start_date
    from partners p
    join public.training_plans tp on tp.owner_id = p.friend_id
    where tp.payload -> 'plan' -> 'weeks' is not null and (tp.payload ->> 'startDate') is not null
  )
  select
    p.friend_id,
    pr.username::text,
    pr.display_name,
    b.block_week,
    b.block_weeks,
    case when b.friend_id is null then null
         else ((b.block_week - 1 + b.wave_offset) % 5)::int end as wave_slot,
    (t.friend_id is not null) as trained_today,
    l.last_trained,
    bs.lift_name,
    bs.weight,
    bs.reps,
    c.summary
  from partners p
  join public.profiles pr on pr.id = p.friend_id
  left join today t on t.friend_id = p.friend_id
  left join best bs on bs.friend_id = p.friend_id
  left join cardio c on c.friend_id = p.friend_id
  left join latest l on l.friend_id = p.friend_id
  left join block b on b.friend_id = p.friend_id
  order by (t.friend_id is not null) desc, pr.display_name;
$$;

revoke all on function public.forge_partner_feed() from public, anon;
grant execute on function public.forge_partner_feed() to authenticated;

/* Adding a partner by username. Mutual by construction: if they already asked
   you, this accepts instead of stacking a second pending row. A cap of five
   keeps this a list of training partners rather than a follower count. */
create or replace function public.forge_partner_add(partner_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_them uuid;
  v_existing public.friendships%rowtype;
  v_count int;
begin
  if v_me is null then raise exception 'Authentication required'; end if;
  select id into v_them from public.profiles
   where lower(username::text) = lower(btrim(partner_username));
  if v_them is null then return 'not_found'; end if;
  if v_them = v_me then return 'self'; end if;

  select count(*) into v_count from public.friendships
   where status = 'accepted' and v_me in (requester_id, addressee_id);
  if v_count >= 5 then return 'full'; end if;

  select * into v_existing from public.friendships
   where (requester_id = v_me and addressee_id = v_them)
      or (requester_id = v_them and addressee_id = v_me)
   limit 1;

  if v_existing.id is null then
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_me, v_them, 'pending');
    return 'requested';
  end if;

  if v_existing.status = 'accepted' then return 'already'; end if;
  if v_existing.status = 'blocked' then return 'blocked'; end if;

  /* They asked first — accept. Otherwise re-open our own declined request. */
  update public.friendships
     set status = 'accepted', responded_at = now(), updated_at = now()
   where id = v_existing.id;
  return case when v_existing.addressee_id = v_me then 'accepted' else 'requested' end;
end;
$$;

revoke all on function public.forge_partner_add(text) from public, anon;
grant execute on function public.forge_partner_add(text) to authenticated;

/* Requests waiting on the caller, so a partner list is never one-sided. */
create or replace function public.forge_partner_requests()
returns table (friendship_id uuid, requester_id uuid, username text, display_name text)
language sql
security definer
set search_path = ''
as $$
  select f.id, f.requester_id, pr.username::text, pr.display_name
  from public.friendships f
  join public.profiles pr on pr.id = f.requester_id
  where f.addressee_id = auth.uid() and f.status = 'pending'
  order by f.created_at;
$$;

revoke all on function public.forge_partner_requests() from public, anon;
grant execute on function public.forge_partner_requests() to authenticated;

/* Removing a partner deletes the row outright: a training partnership that
   ended should not leave a record either side can see. */
create or replace function public.forge_partner_remove(partner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Authentication required'; end if;
  delete from public.friendships
   where (requester_id = v_me and addressee_id = partner_id)
      or (requester_id = partner_id and addressee_id = v_me);
end;
$$;

revoke all on function public.forge_partner_remove(uuid) from public, anon;
grant execute on function public.forge_partner_remove(uuid) to authenticated;

commit;
