import resolve from "@rollup/plugin-node-resolve";
import { babel } from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import alias from "@rollup/plugin-alias";
// import path from "path";

const TERSER_OPTIONS = {
  module: true,
  compress: { passes: 3 },
  mangle: true,
};

// const projectRootDir = path.resolve(import.meta.dirname);

export default {
  input: "src/main.jsx",
  output: { file: "dist/main.js", format: "iife" },
  plugins: [
    alias({
      entries: [
        {
          find: "x-jsx",
          replacement:
            "/home/lucifer/work/conf-demos/async-state/solid-suspense-demo-v2/lib/x-jsx/dist",
        },
        {
          find: "@solidjs/signals",
          replacement:
            "/home/lucifer/work/conf-demos/async-state/solid-suspense-demo-v2/lib/signals/dist/dev.js",
        },
      ],
    }),

    babel({
      babelHelpers: "bundled",
      exclude: "node_modules/**",
      presets: [
        ["solid", { omitNestedClosingTags: true, moduleName: "x-jsx" }],
      ],
    }),
    resolve({ extensions: [".js", ".jsx"] }),
    process.env.production && terser(TERSER_OPTIONS),
  ].filter(Boolean),
};
