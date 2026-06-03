// ESLint 10 flat config del monorepo: TS recommended + import sort +
// unused-imports + prettier para todo el repo, y react-hooks (subset estable)
// acotado a los frontends. Reglas de NestJS/seguridad pendientes (ver roadmap en
// docs/superpowers/specs/2026-06-03-refactor-dominio-design.md).

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.claude/**',
      '**/.worktrees/**',
      '**/generated/**',
      '**/*.generated.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // Reglas de React Hooks en los frontends. Se activan las dos reglas clásicas y
  // universalmente adoptadas (las del preset estable de versiones previas), que
  // el codebase ya cumple:
  //   - rules-of-hooks (error): garantiza el orden/contexto correcto de los hooks.
  //   - exhaustive-deps (warn): avisa de dependencias omitidas en efectos/memos.
  // Las reglas nuevas del React Compiler que trae el preset `recommended` de v7
  // (set-state-in-effect, refs, purity, immutability…) quedan FUERA a propósito:
  // marcan patrones idiomáticos en uso (reset de estado por prop, latest-ref) cuyo
  // arreglo cambia comportamiento y requiere tests de render antes. Ver
  // docs/superpowers/specs/2026-06-03-refactor-dominio-design.md (roadmap).
  {
    files: ['apps/tpv/**/*.{ts,tsx}', 'apps/backoffice/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  prettier,
);
