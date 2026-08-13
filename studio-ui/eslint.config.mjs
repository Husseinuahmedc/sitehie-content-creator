import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Flat-config migration of the previous `.eslintrc.json` (`{ "extends": "next" }`).
// eslint-config-next@15.x is a legacy-format config, so it is loaded through
// FlatCompat; the direct `import next from "eslint-config-next"` form only
// works with eslint-config-next@16+.
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...compat.extends("next"),
  {
    // The legacy `{ "extends": "next" }` config registers @typescript-eslint's
    // *parser* for TS files but not its plugin, so this rule was never actually
    // defined. Source files already carry explicit
    // `eslint-disable-next-line @typescript-eslint/no-explicit-any` opt-outs at
    // every intentional `any` (lib/layoutTargets.ts) —
    // i.e. the codebase's convention is "rule on, `any` only via explicit
    // opt-out". Register the plugin and enable the rule as a warning so those
    // disable comments resolve (ESLint 9 errors on disable comments for
    // undefined rules) without introducing any other new rules.
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tsEslintPlugin },
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
];

export default eslintConfig;
