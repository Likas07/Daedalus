import { defineConfig } from 'vitest/config';

const integrationLikeTests = [
  '**/node_modules/**',
  'test/abort.test.ts',
  'test/context-overflow.test.ts',
  'test/cross-provider-handoff.test.ts',
  'test/empty.test.ts',
  'test/google-thinking-disable.test.ts',
  'test/image-tool-result.test.ts',
  'test/lazy-module-load.test.ts',
  'test/openai-responses-reasoning-replay-e2e.test.ts',
  'test/openai-responses-tool-result-images.test.ts',
  'test/overflow.test.ts',
  'test/responseid.test.ts',
  'test/stream.test.ts',
  'test/tokens.test.ts',
  'test/tool-call-id-normalization.test.ts',
  'test/tool-call-without-result.test.ts',
  'test/total-tokens.test.ts',
  'test/unicode-surrogate.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    exclude: integrationLikeTests,
  }
});
