// node --experimental-strip-types --test tests/api-error.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../lib/api.ts';

test('API retains HTTP status + structured error code for retry decisions', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 409, json: async () => ({ code: 'PAYMENT_IN_PROGRESS', message: 'Đang xử lý' }),
  });
  try {
    await assert.rejects(api('/payments'), (e) => e instanceof ApiError &&
      e.status === 409 && e.code === 'PAYMENT_IN_PROGRESS' && e.message === 'Đang xử lý');
  } finally { globalThis.fetch = previous; }
});

test('API preserves 402 payment decline and 504 gateway timeout codes', async () => {
  const previous = globalThis.fetch;
  try {
    for (const [status, code] of [[402, 'PAYMENT_DECLINED'], [504, 'GATEWAY_TIMEOUT']]) {
      globalThis.fetch = async () => ({
        ok: false, status, json: async () => ({ code, message: code }),
      });
      await assert.rejects(api('/payments'), (e) => e instanceof ApiError && e.status === status && e.code === code);
    }
  } finally { globalThis.fetch = previous; }
});
