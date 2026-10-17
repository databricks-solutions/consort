#!/usr/bin/env node
// consort-apply-design-theme: write client/src/styles/theme.css :root FROM the
// UX designer's .consort/design/design-guide.json, so the tokens the designer
// derived are what the app actually renders (not the frozen scaffold baseline).
// The UX designer runs this after (re)writing design-guide.json; it is
// deterministic + idempotent, and the design-adherence gate reads these :root
// vars back to confirm they match the guide.
//
//   consort-apply-design-theme [--project <dir>] [--if-guide]   (default: cwd)
//
// --if-guide: no-op (exit 0) when no design guide exists instead of failing — used by
// the DRIVER post-turn re-freeze, which runs on every project whether or not it is a
// UI track. Without it (the UX-designer path) a missing guide is a loud error.
//
// Exit: 0 wrote the theme (or --if-guide no-op); 1 no design guide (run the UX designer first).

import { applyDesignGuideTheme } from "../../consort/architecture/apply-theme.js";

interface Args {
  project?: string;
  ifGuide?: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.project = argv[++i];
    else if (argv[i] === "--if-guide") out.ifGuide = true;
  }
  return out;
}

function main(): number {
  const a = parse(process.argv.slice(2));
  const projectDir = a.project ?? process.cwd();
  try {
    const { themePath, varCount, iconInstalled, skipped } = applyDesignGuideTheme(projectDir, { ifGuide: a.ifGuide });
    if (skipped) {
      process.stdout.write(`apply-design-theme: no design guide (--if-guide) — nothing to apply.\n`);
      return 0;
    }
    process.stdout.write(`apply-design-theme: wrote ${varCount} design tokens to ${themePath} (:root generated from design-guide.json).\n`);
    if (iconInstalled) {
      process.stdout.write(`apply-design-theme: installed the brand app icon + pointed the favicon at it (design-guide app_icon).\n`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`apply-design-theme: ${(err as Error).message}\n`);
    return 1;
  }
}

process.exit(main());
