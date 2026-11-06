import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { components } from '../src/hub/generated';
import { isRecord } from '../src/record';
import balanceOk from './fixtures/balance_ok.json';
import betOk from './fixtures/bet_ok.json';
import betRefused from './fixtures/bet_refused.json';
import betRetry from './fixtures/bet_retry.json';
import depositMessage from './fixtures/deposit_message.json';
import winOk from './fixtures/win_ok.json';

type Schemas = components['schemas'];

type Widened<Wire> = Wire extends string
  ? string
  : Wire extends number
    ? number
    : Wire extends boolean
      ? boolean
      : { [Key in keyof Wire]: Widened<Wire[Key]> };

interface ContractExample {
  readonly path: readonly string[];
  readonly value: unknown;
}

interface FixtureBinding {
  readonly path: readonly string[];
  readonly fixtures: readonly unknown[];
}

const CONTRACT_URL = new URL(
  '../../tasks/own-slots-or-free-pragmatic/from-origin/contract.openapi.yaml',
  import.meta.url,
);
const JSON_BODY = ['content', 'application/json'] as const;
const BALANCE_CALL = ['paths', '/webhook/{partner}/balance', 'post', 'requestBody', ...JSON_BODY] as const;
const BET_CALL = ['paths', '/webhook/{partner}/bet', 'post', 'requestBody', ...JSON_BODY] as const;
const WIN_CALL = ['paths', '/webhook/{partner}/win', 'post', 'requestBody', ...JSON_BODY] as const;

const typedFixtures = {
  balanceRequest: balanceOk.request satisfies Widened<Schemas['BalanceRequest']>,
  balanceAnswer: balanceOk.response satisfies Widened<Schemas['Accepted']>,
  betWithWin: betOk.requests.spinWithWin satisfies Widened<Schemas['MoneyRequest']>,
  betWithoutWin: betOk.requests.spinWithoutWin satisfies Widened<Schemas['MoneyRequest']>,
  betAnswer: betOk.response satisfies Widened<Schemas['Accepted']>,
  refusedBetRequest: betRefused.request satisfies Widened<Schemas['MoneyRequest']>,
  refusedBetAnswer: betRefused.refused satisfies Widened<Schemas['Refused']>,
  unauthorizedBetAnswer: betRefused.unauthorized satisfies Widened<Schemas['Refused']>,
  retriedBetRequest: betRetry.request satisfies Widened<Schemas['MoneyRequest']>,
  retryAnswer: betRetry.response satisfies Widened<Schemas['Retry']>,
  winRequest: winOk.request satisfies Widened<Schemas['MoneyRequest']>,
  winAnswer: winOk.response satisfies Widened<Schemas['Accepted']>,
  depositMessage: depositMessage satisfies Widened<Schemas['DepositMessage']>,
};

const fixtureBindings: readonly FixtureBinding[] = [
  { path: [...BALANCE_CALL, 'example'], fixtures: [typedFixtures.balanceRequest] },
  {
    path: ['components', 'responses', 'Ok', ...JSON_BODY, 'example'],
    fixtures: [typedFixtures.balanceAnswer, typedFixtures.betAnswer, typedFixtures.winAnswer],
  },
  {
    path: [...BET_CALL, 'examples', 'spinWithWin', 'value'],
    fixtures: [typedFixtures.betWithWin, typedFixtures.refusedBetRequest, typedFixtures.retriedBetRequest],
  },
  { path: [...BET_CALL, 'examples', 'spinWithoutWin', 'value'], fixtures: [typedFixtures.betWithoutWin] },
  { path: [...WIN_CALL, 'example'], fixtures: [typedFixtures.winRequest] },
  {
    path: ['components', 'responses', 'Unauthorized', ...JSON_BODY, 'example'],
    fixtures: [typedFixtures.unauthorizedBetAnswer],
  },
  {
    path: ['components', 'responses', 'Refused', ...JSON_BODY, 'example'],
    fixtures: [typedFixtures.refusedBetAnswer],
  },
  { path: ['components', 'responses', 'Retry', ...JSON_BODY, 'example'], fixtures: [typedFixtures.retryAnswer] },
  { path: ['x-game-window-messages', 'deposit', 'example'], fixtures: [typedFixtures.depositMessage] },
];

function valueAt(document: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => {
    if (!isRecord(node) || !(key in node)) {
      throw new Error(`the contract has nothing at ${path.join(' > ')}`);
    }
    return node[key];
  }, document);
}

function namedExamples(path: readonly string[], examples: unknown): readonly ContractExample[] {
  if (!isRecord(examples)) {
    throw new Error(`examples at ${path.join(' > ')} is not a map`);
  }
  return Object.entries(examples).map(([name, example]) => ({
    path: [...path, name, 'value'],
    value: valueAt(example, ['value']),
  }));
}

function collectExamples(node: unknown, path: readonly string[] = []): readonly ContractExample[] {
  if (!isRecord(node)) {
    return [];
  }
  return Object.entries(node).flatMap(([key, child]) => {
    const childPath = [...path, key];
    if (key === 'example') {
      return [{ path: childPath, value: child }];
    }
    if (key === 'examples') {
      return namedExamples(childPath, child);
    }
    return collectExamples(child, childPath);
  });
}

const contract: unknown = parse(readFileSync(fileURLToPath(CONTRACT_URL), 'utf8'));

describe('the hub contract and its fixtures', () => {
  it.each(fixtureBindings.map((binding) => [binding.path.join(' > '), binding] as const))(
    'every fixture of %s equals the example of the contract',
    (_name, binding) => {
      const example = valueAt(contract, binding.path);
      for (const fixture of binding.fixtures) {
        expect(fixture).toEqual(example);
      }
    },
  );

  it('has no example that lacks a fixture', () => {
    const inContract = collectExamples(contract).map((example) => example.path.join(' > '));
    const withFixture = fixtureBindings.map((binding) => binding.path.join(' > '));
    expect([...inContract].sort()).toEqual([...withFixture].sort());
  });
});
