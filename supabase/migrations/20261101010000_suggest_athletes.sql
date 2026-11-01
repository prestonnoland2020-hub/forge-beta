/* SUGGESTED PARTNERS — what the partner search shows before anything is typed.

   An empty search box was a blank screen asking the athlete to already know
   a name. This fills it the way a phone's contacts search does: people you
   probably know first, then people training toward the same thing.

     1. Partners of your partners, most shared partners first.
     2. Then athletes with your primary goal who set up recently.

   Only discoverable athletes are suggested. The discoverable flag governs
   browsing, and a suggestion is browsing. Anyone you are already linked to,
   accepted or pending, is left out, so the list never offers to add someone
   twice. Eight at most. */
create or replace function public.forge_suggest_athletes()
returns table (id uuid, username text, display_name text, mutuals integer, relation text)
language sql security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  mine as (
    select case when f.requester_id = m.id then f.addressee_id else f.requester_id end as other, f.status
    from public.friendships f cross join me m
    where m.id in (f.requester_id, f.addressee_id) and f.status in ('accepted', 'pending')
  ),
  partners as (select other from mine where status = 'accepted'),
  via_partners as (
    select case when f.requester_id = p.other then f.addressee_id else f.requester_id end as other
    from public.friendships f join partners p on p.other in (f.requester_id, f.addressee_id)
    where f.status = 'accepted'
  ),
  mutual as (select other, count(*)::integer as mutuals from via_partners group by other),
  eligible as (
    select pr.id, pr.username::text as username, pr.display_name, pr.primary_goal, pr.updated_at,
           coalesce(mu.mutuals, 0) as mutuals
    from public.profiles pr cross join me m
    left join mutual mu on mu.other = pr.id
    where pr.id <> m.id
      and pr.discoverable
      and pr.username is not null
      and pr.onboarding_completed
      and not exists (select 1 from mine x where x.other = pr.id)
  ),
  my_goal as (select pr.primary_goal from public.profiles pr cross join me m where pr.id = m.id)
  select e.id, e.username, coalesce(nullif(e.display_name, ''), e.username), e.mutuals, 'none'::text
  from eligible e left join my_goal g on true
  where e.mutuals > 0 or e.primary_goal = g.primary_goal
  order by e.mutuals desc, e.updated_at desc
  limit 8;
$$;
revoke all on function public.forge_suggest_athletes() from public, anon;
grant execute on function public.forge_suggest_athletes() to authenticated;
