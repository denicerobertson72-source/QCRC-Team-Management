-- V1.29: add 1x support to rowing meetup and comments to race signups

alter table public.rowing_meetup_members
  add column if not exists wants_1x boolean not null default false;

alter table public.race_signups
  add column if not exists comments text;
