import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'work/**',
      'outputs/**',
      'node_modules/**',
      '.wrangler/**',
      'src/legacy/**',
      'worker/src/worker-configuration.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
