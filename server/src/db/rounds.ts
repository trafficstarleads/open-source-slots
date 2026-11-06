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
export type OwedStatus = typeof ROUND_STATUS.betPending | typeof ROUND_STATUS.winPending;

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
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastError: string | null;
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
  readonly dueAt: Date;
}

export interface RoundBacklog {
  readonly waitingBet: number;
  readonly waitingWin: number;
  readonly parked: number;
  readonly oldestWaitingSeconds: number;
}

const COLUMNS = `id, game, token, spin_key AS "spinKey", bet_cents AS "betCents", result, win_cents AS "winCents",
  status, refusal_code AS "refusalCode", bet_sends AS "betSends", bet_busy_answers AS "betBusyAnswers",
  balance_cents AS "balanceCents", attempts, next_attempt_at AS "nextAttemptAt", last_error AS "lastError",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function selectById(db: Database, id: string): Promise<QueryResult<RoundRow>> {
  return db.query<RoundRow>(`SELECT ${COLUMNS} FROM rounds WHERE id = $1`, [id]);
}

async function updatedOrCurrent(db: Database, id: string, update: QueryResult<RoundRow>): Promise<RoundRow> {
  if (update.rows.length > 0) {
    return update.rows[0];
  }
  return (await selectById(db, id)).rows[0];
}

export async function findRoundById(db: Database, id: string): Promise<RoundRow | null> {
  return (await selectById(db, id)).rows[0] ?? null;
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
    `INSERT INTO rounds (id, game, token, spin_key, bet_cents, result, win_cents, status, next_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
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
      round.dueAt,
    ],
  );
  return saved.rows[0];
}

export async function claimRound(db: Database, id: string, now: Date, leaseUntil: Date): Promise<RoundRow | null> {
  const claimed = await db.query<RoundRow>(
    `UPDATE rounds SET next_attempt_at = $4, updated_at = now()
     WHERE id = $1 AND status = $2 AND next_attempt_at <= $3 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending, now, leaseUntil],
  );
  return claimed.rows[0] ?? null;
}

export async function claimDueRounds(db: Database, now: Date, leaseUntil: Date, limit: number): Promise<RoundRow[]> {
  const claimed = await db.query<RoundRow>(
    `WITH due AS (
       SELECT id AS due_id FROM rounds
       WHERE status IN ($1, $2) AND next_attempt_at <= $3
       ORDER BY next_attempt_at
       LIMIT $5
       FOR UPDATE SKIP LOCKED
     )
     UPDATE rounds SET next_attempt_at = $4, updated_at = now()
     FROM due WHERE rounds.id = due.due_id
     RETURNING ${COLUMNS}`,
    [ROUND_STATUS.betPending, ROUND_STATUS.winPending, now, leaseUntil, limit],
  );
  return claimed.rows;
}

export async function recordBetSend(db: Database, id: string, leaseUntil: Date): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET bet_sends = bet_sends + 1, next_attempt_at = $3, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending, leaseUntil],
  );
  return updatedOrCurrent(db, id, update);
}

export async function recordBetFailure(db: Database, id: string, busy: boolean, error: string): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET bet_busy_answers = bet_busy_answers + $3::int, last_error = $4, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending, busy ? 1 : 0, error],
  );
  return updatedOrCurrent(db, id, update);
}

export async function deferRound(
  db: Database,
  id: string,
  status: OwedStatus,
  error: string,
  dueAt: Date,
): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET attempts = attempts + 1, last_error = $3, next_attempt_at = $4, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, status, error, dueAt],
  );
  return updatedOrCurrent(db, id, update);
}

export function owesWin(round: Pick<RoundRow, 'winCents'>): boolean {
  return round.winCents > 0;
}

export async function acceptBet(
  db: Database,
  round: RoundRow,
  balanceCents: number,
  leaseUntil: Date,
): Promise<RoundRow> {
  const winOwed = owesWin(round);
  const update = await db.query<RoundRow>(
    `UPDATE rounds
     SET status = $3, next_attempt_at = $4, balance_cents = $5, attempts = 0, last_error = NULL, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [
      round.id,
      ROUND_STATUS.betPending,
      winOwed ? ROUND_STATUS.winPending : ROUND_STATUS.settled,
      winOwed ? leaseUntil : null,
      balanceCents,
    ],
  );
  return updatedOrCurrent(db, round.id, update);
}

export async function settleWin(db: Database, id: string, balanceCents: number): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET status = $3, balance_cents = $4, next_attempt_at = NULL, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.winPending, ROUND_STATUS.settled, balanceCents],
  );
  return updatedOrCurrent(db, id, update);
}

export async function parkWin(db: Database, id: string, error: string): Promise<RoundRow> {
  const update = await db.query<RoundRow>(
    `UPDATE rounds SET status = $3, last_error = $4, next_attempt_at = NULL, updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.winPending, ROUND_STATUS.parked, error],
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
     SET status = $3, result = NULL, win_cents = 0, refusal_code = $4, balance_cents = $5, next_attempt_at = NULL,
         updated_at = now()
     WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
    [id, ROUND_STATUS.betPending, ROUND_STATUS.refused, refusalCode, balanceCents],
  );
  return updatedOrCurrent(db, id, update);
}

export async function roundBacklog(db: Database): Promise<RoundBacklog> {
  const found = await db.query<RoundBacklog>(
    `SELECT
       (SELECT count(*) FROM rounds WHERE status = $1)::int AS "waitingBet",
       (SELECT count(*) FROM rounds WHERE status = $2)::int AS "waitingWin",
       (SELECT count(*) FROM rounds WHERE status = $3)::int AS "parked",
       coalesce((
         SELECT floor(extract(epoch FROM now() - min(created_at)))
         FROM rounds WHERE status IN ($1, $2)
       ), 0)::int AS "oldestWaitingSeconds"`,
    [ROUND_STATUS.betPending, ROUND_STATUS.winPending, ROUND_STATUS.parked],
  );
  return found.rows[0];
}
