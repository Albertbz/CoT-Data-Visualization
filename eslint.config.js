const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  // top-level ignore patterns
  {
    ignores: ["node_modules", "dist", "*.log"]
  },
  // configuration for TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      // use the parser module (must expose parse/parseForESLint)
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
      }
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      // use plugin recommended rules where available
      ...(tsPlugin && tsPlugin.configs && tsPlugin.configs.recommended && tsPlugin.configs.recommended.rules ? tsPlugin.configs.recommended.rules : {}),
      // project-specific overrides
      "no-console": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];
