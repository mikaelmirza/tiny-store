import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // The library runs everywhere, so allow both browser and Node globals.
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
    },
  },

  // Rules of Hooks for the React adapter and its tests.
  {
    files: ['src/react.js', 'test/**/*.jsx'],
    ...reactHooks.configs.flat.recommended,
  },

  // Tests: React is in scope for JSX.
  {
    files: ['test/**/*.jsx'],
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(React|_)', argsIgnorePattern: '^_' },
      ],
    },
  },

  // Turn off any rules that would fight with Prettier. Must stay last.
  prettier,
];
