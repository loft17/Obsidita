// Lint del frontend (web/src). El servidor es JS plano y no se analiza
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['web/dist/**', 'web/src/fonts/**'] },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Del React Compiler solo las que señalan errores reales: leer/escribir refs durante el
      // render y reasignar variables de módulo. set-state-in-effect y compañía avisan de
      // patrones válidos (estado de carga, reinicios al cambiar una prop) y no se activan
      'react-hooks/refs': 'error',
      'react-hooks/globals': 'error',
      // Un useEffect sin array de dependencias corre tras cada render: casi siempre es un descuido
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useEffect'][arguments.length=1]",
          message: 'useEffect sin array de dependencias: se ejecuta tras cada render. Indica las dependencias.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Desactiva las reglas de formato que se pisarían con Prettier
  prettier,
);
