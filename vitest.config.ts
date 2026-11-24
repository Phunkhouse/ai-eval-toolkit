import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests exercise the source; scripts/run-examples.ts exercises the built package.
    alias: { 'ai-eval-toolkit': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
