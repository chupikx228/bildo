import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";
import globals from "globals";

const FSD_LAYERS = ["shared", "entities", "features", "widgets", "pages", "app"];

const SEGMENT_ONLY_LAYERS = new Set(["shared", "app"]);

const fsdPolicies = FSD_LAYERS.map((layer, index) => {
  const allowed = FSD_LAYERS.slice(0, index);
  if (SEGMENT_ONLY_LAYERS.has(layer)) allowed.push(layer);
  return {
    from: [{ element: { type: layer } }],
    allow: allowed.map((target) => ({ to: { element: { type: target } } })),
  };
});

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/*.config.js"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
    },
  },

  reactHooks.configs.flat["recommended-latest"],

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    ...reactRefresh.configs.vite,
  },

  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { project: ["apps/web/tsconfig.json"] } },
      "boundaries/include": ["**/apps/web/src/**/*"],
      "boundaries/elements": FSD_LAYERS.map((layer) => ({
        type: layer,
        pattern: `**/apps/web/src/${layer}/*`,
        capture: ["slice"],
      })),
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "FSD: слой {{from.type}} не может импортировать из {{to.type}} — только из слоёв ниже себя",
          policies: fsdPolicies,
        },
      ],
    },
  },

  {
    files: ["**/vite.config.ts", "**/*.config.ts"],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
