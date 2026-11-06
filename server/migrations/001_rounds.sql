create table rounds (
  id uuid primary key,
  game text not null,
  token text not null,
  spin_key text not null,
  bet_cents integer not null check (bet_cents between 10 and 1000),
  result jsonb,
  win_cents integer not null default 0 check (win_cents >= 0),
  status text not null check (status in ('bet_pending', 'win_pending', 'settled', 'refused', 'parked')),
  refusal_code text check (status <> 'refused' or refusal_code is not null),
  bet_sends integer not null default 0,
  bet_busy_answers integer not null default 0,
  balance_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rounds_token_spin_key_key unique (token, spin_key)
);
