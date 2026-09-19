import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'work/**', 'outputs/**', 'node_modules/**', 'src/legacy/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
