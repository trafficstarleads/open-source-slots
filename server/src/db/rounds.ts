import type { QueryResult } from 'pg';
import type { GameSymbol } from '../games/registry';
import type { BetRefusal } from '../hub/client';
import type { Database } from './pool';

export const ROUND_STATUS = {
  betPending: 'bet_pending',
  winPending: 'win_pending',
  settled: 'settled',
  refused: 'refused',
  parked: 'parked',
} as const;

export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];

export type RoundRow = {
  readonly id: string;
  readonly game: GameSymbol;
  readonly token: string;
  readonly spinKey: string;
  readonly betCents: number;
  readonly result: unknown;
  readonly winCents: number;
  readonly status: RoundStatus;
  readonly refusalCode: BetRefusal | null;
  readonly betSends: number;
  readonly betBusyAnswers: number;
  readonly balanceCents: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export interface NewRound {
  readonly id: string;
  readonly game: GameSymbol;
  readonly token: string;
  readonly spinKey: string;
  readonly betCents: number;
  readonly result: unknown;
  readonly winCents: number;
}

const COLUMNS = `id, game, token, spin_key AS "spinKey", bet_cents AS "betCents", result, win_cents AS "winCents",
  status, refusal_code AS "refusalCode", bet_sends AS "betSends", bet_busy_answers AS "betBusyAnswers",
  balance_cents AS "balanceCents", created_at AS "createdAt", updated_at AS "updatedAt"`;

async function updatedOrCurrent(db: Database, id: string, update: QueryResult<RoundRow>): Promise<RoundRow> {
  if (update.rows.length > 0) {
    return update.rows[0];
  }
  const current = await db.query<RoundRow>(`SELECT ${COLUMNS} FROM rounds WHERE id = $1`, [id]);
  return current.rows[0];
}

export async function findRound(db: Database, token: string, spinKey: string): Promise<RoundRow | null> {
  const found = await db.query<RoundRow>(`SELECT ${COLUMNS} FROM rounds WHERE token = $1 AND spin_key = $2`, [
    token,
    spinKey,
  ]);
  return found.rows[0] ?? null;
}

export async function saveRound(db: Database, round: NewRound): Promise<RoundRow> {
  const saved = await db.query<RoundRow>(
    `INSERT INTO rounds (id, game, token, spin_key, bet_cents, result, win_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (token, spin_key) DO UPDATE SET spin_key = excluded.spin_key
     RETURNING ${COLUMNS}`,
    [
      round.id,
      round.game,
      round.token,
      round.spinKey,
      round.betCents,
      JSON.stringify(round.result),
      round.winCents,
      ROUND_STATUS.betPending,
    ],
  );
  return saved.rows[0];
}

export async function recordBetSend(db: Database, id: string): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET bet_sends = bet_sends + 1, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending],
  );
  return updatedOrCurrent(db, id, update);
}

export async function recordBetBusyAnswer(db: Database, id: string): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET bet_busy_answers = bet_busy_answers + 1, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending],
  );
  return updatedOrCurrent(db, id, update);
}

export async function acceptBet(db: Database, id: string, balanceCents: number): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds
     SET status = CASE WHEN win_cents > 0 THEN $3 ELSE $4 END, balance_cents = $5, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending, ROUND_STATUS.winPending, ROUND_STATUS.settled, balanceCents],
  );
  return updatedOrCurrent(db, id, update);
}

export async function settleWin(db: Database, id: string, balanceCents: number): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET status = $3, balance_cents = $4, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.winPending, ROUND_STATUS.settled, balanceCents],
  );
  return updatedOrCurrent(db, id, update);
}

export async function refuseBet(
  db: Database,
  id: string,
  refusalCode: BetRefusal,
  balanceCents: number | null,
): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds
     SET status = $3, result = NULL, win_cents = 0, refusal_code = $4, balance_cents = $5, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending, ROUND_STATUS.refused, refusalCode, balanceCents],
  );
  return updatedOrCurrent(db, id, update);
}
