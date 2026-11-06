import { describe, expect, it } from 'vitest';
import { SERVER_ERROR_CODES } from '../../client-kit/src/messages';
import { BROWSER_ERROR_CODES } from '../src/http/browserError';

describe('browser error codes', () => {
  it('are the codes the game windows know, so no code reaches a window as an unknown one', () => {
    expect([...BROWSER_ERROR_CODES].sort()).toEqual([...SERVER_ERROR_CODES].sort());
  });
});
