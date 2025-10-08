import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      // 导入规范：所有 import 必须在文件顶部
      'import/first': 'error',
      
      // 导入顺序：外部依赖 -> 内部模块 -> 类型导入
      'import/order': ['error', {
        'groups': [
          'builtin',      // Node.js 内置模块
          'external',     // 外部依赖
          'internal',     // 内部模块
          'parent',       // 父级目录
          'sibling',      // 同级目录
          'index',        // 索引文件
          'type',         // 类型导入
        ],
        'newlines-between': 'always',
        'alphabetize': {
          'order': 'asc',
          'caseInsensitive': true
        }
      }],
      
      // 禁止动态 require
      'import/no-dynamic-require': 'error',
      
      // 禁止使用 require（应使用 ES6 import）
      '@typescript-eslint/no-require-imports': 'error',
      
      // 函数长度限制（50行）
      'max-lines-per-function': ['warn', {
        max: 50,
        skipBlankLines: true,
        skipComments: true
      }],
      
      // 其他项目规范
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-interface': 'off', // 我们使用 type 而非 interface
    }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.config.js',
      'ecosystem.config.js'
    ]
  }
);

