import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests target the pure state-derivation helpers in lib/ (no DOM, no server), plus
// app/render.test.tsx, which snapshots component markup to prove the token refactor left
// appearance untouched. Both run in node: the render harness uses renderToStaticMarkup,
// so it needs a React JSX transform but no DOM.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // `app/**/*.test.ts` (not just .tsx) picks up the API route tests, which import route
    // handlers rather than components. Without it they are silently collected as zero files.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "app/**/*.test.tsx"],
  },
});
