-- Optional step counter for daily activity ring (updated by app / future health sync).
alter table public.daily_stats
  add column if not exists steps integer not null default 0;

comment on column public.daily_stats.steps is 'Daily step count; 0 until synced from device or manual entry.';
