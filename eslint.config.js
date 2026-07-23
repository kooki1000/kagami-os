import antfu from "@antfu/eslint-config";
import eslintPluginBetterTailwindcss from "eslint-plugin-better-tailwindcss";
import reactHooks from "eslint-plugin-react-hooks";

export default antfu(
  {
    react: true,
    formatters: true,
    stylistic: {
      indent: 2,
      semi: true,
      quotes: "double",
    },
    // Cargo.toml/.lock are Rust-ecosystem files reformatted by `cargo fmt`/
    // `cargo add`/`tauri add` on every change — leave them to that tooling
    // rather than fighting it with this JS project's ESLint style.
    ignores: ["dist", "node_modules", "src-tauri/target", "src-tauri/gen", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Doc fences are illustrative fragments, not modules — kept `ts`/`tsx` so
    // they still highlight.
    files: ["**/*.md/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react/rules-of-hooks": "off",
      "react/set-state-in-effect": "off",
      "style/semi": "off",
      "ts/no-empty-function": "off",
      "unused-imports/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "better-tailwindcss": eslintPluginBetterTailwindcss,
    },
    rules: {
      ...eslintPluginBetterTailwindcss.configs["recommended-warn"].rules,
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "src/styles/global.css",
      },
    },
  },
);
