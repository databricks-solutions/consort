#!/usr/bin/env node
// consort-apply-design-theme: write client/src/styles/theme.css :root FROM the
// UX designer's .consort/design/design-guide.json, so the tokens the designer
// derived are what the app actually renders (not the frozen scaffold baseline).
// The UX designer runs this after (re)writing design-guide.json; it is
// deterministic + idempotent, and the design-adherence gate reads these :root
// vars back to confirm they match the guide.
//
//   consort-apply-design-theme [--project <dir>]   (default: cwd)
//
// Exit: 0 wrote the theme; 1 no design guide (run the UX designer first).

import { applyDesignGuideTheme } from "../../consort/architecture/apply-theme.js";

interface Args {
  project?: string;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.project = argv[++i];
  }
  return out;
}

function main(): number {
  const a = parse(process.argv.slice(2));
  const projectDir = a.project ?? process.cwd();
  try {
    const { themePath, varCount } = applyDesignGuideTheme(projectDir);
    process.stdout.write(`apply-design-theme: wrote ${varCount} design tokens to ${themePath} (:root generated from design-guide.json).\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`apply-design-theme: ${(err as Error).message}\n`);
    return 1;
  }
}

process.exit(main());
