module.exports = {
  root: true,
  env: {
    browser: true,
    es2023: true,
    node: true,
  },
  ignorePatterns: ['dist', 'dist-electron', 'coverage', 'android', 'src/**/*.d.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'solid', 'neverthrow'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:solid/typescript',
  ],
  rules: {
    'neverthrow/must-use-result': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ThrowStatement',
        message: 'Use neverthrow results instead of exceptions.',
      },
    ],
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
  },
  overrides: [
    {
      files: ['electron/**/*.ts', 'vite.config.ts', 'tsup.config.ts', 'capacitor.config.ts'],
      rules: {
        'neverthrow/must-use-result': 'off',
      },
    },
    {
      files: ['src/**/*.test.ts'],
      rules: {
        'neverthrow/must-use-result': 'off',
      },
    },
  ],
}
