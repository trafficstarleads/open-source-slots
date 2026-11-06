alter table rounds
  add column attempts integer not null default 0,
  add column next_attempt_at timestamptz,
  add column last_error text;

update rounds set next_attempt_at = now() where status in ('bet_pending', 'win_pending');

create index rounds_due_idx on rounds (next_attempt_at) where status in ('bet_pending', 'win_pending');
create index rounds_parked_idx on rounds (status) where status = 'parked';
