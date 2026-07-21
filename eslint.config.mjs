import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { fixupPluginRules } from "@eslint/compat";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import neverthrow from "eslint-plugin-neverthrow";

const tsconfigRootDir = fileURLToPath(new URL(".", import.meta.url));
const neverthrowRule = neverthrow.rules["must-use-result"];
const patchedNeverthrowRule = {
  ...neverthrowRule,
  create(context) {
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices) {
      throw new Error("types not available, maybe you need set the parser to @typescript-eslint/parser");
    }
    const legacyContext = new Proxy(context, {
      get(target, property, receiver) {
        return property === "parserServices" ? parserServices : Reflect.get(target, property, receiver);
      },
    });
    return neverthrowRule.create(legacyContext);
  },
};
const patchedNeverthrow = fixupPluginRules({
  ...neverthrow,
  rules: {
    ...neverthrow.rules,
    "must-use-result": patchedNeverthrowRule,
  },
});

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "backend/**", "**/*.d.ts", "**/coverage/**", "**/*.config.{ts,js,mjs,cjs}", "**/vite.config.ts", "**/vitest.config.ts"],
  },
  {
    files: ["packages/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        project: "./tsconfig.eslint.json",
        tsconfigRootDir,
      },
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        window: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      neverthrow: patchedNeverthrow,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      "max-depth": ["error", 3],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "neverthrow/must-use-result": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Use neverthrow results instead of exceptions.",
        },
      ],
    },
  },
  {
    files: ["packages/**/*.{test,spec}.{ts,tsx}", "apps/**/*.{test,spec}.{ts,tsx}", "**/*.config.{ts,js,mjs,cjs}"],
    rules: {
      "neverthrow/must-use-result": "off",
    },
  },
];
