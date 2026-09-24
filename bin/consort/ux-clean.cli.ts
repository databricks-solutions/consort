#!/usr/bin/env node
// CLI for the ux-clean gate: prove a UI-track project's feature pages are
// REACHABLE (wired into App.tsx's <Routes>) and CONSUME the design guide (tokens
// / the design-class vocabulary, not bare browser-default HTML). The deterministic,
// model-independent backstop for the `ux-adherence` smell, mirroring
// consort-layering-clean. The build runs this at REVIEW (see cycle-record.ts
// flagUxAdherenceIfDirty); this CLI gives the Driver a way to SEE what to fix.
//
// Exit 0 = clean (every feature page routed + styled), OR the project has no
//          client/ workspace (a non-UI project has no UI to check).
// Exit 1 = a feature page is unreachable and/or bare. Prints the offending pages
//          + remediation.
//
// Usage:
//   consort-ux-clean [--project-dir <path>] [--client-src <path>]
//                           [--design-class <name> ...] [--json]
//
// --design-class repeats the design guide's component-class vocabulary (page,
// card, btn, ...); when omitted, ANY className counts as a design signal (the
// conservative default – only truly class-less + var-less pages are flagged).

import { checkUxClean, summarizeUxViolations, readAppIconFromGuide, UX_CLEAN_REMEDIATION } from "../../consort/architecture/design-adherence.js";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";

interface Parsed {
  projectDir: string;
  clientSrc?: string;
  designClasses: string[];
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), designClasses: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--client-src" && i + 1 < argv.length) out.clientSrc = argv[++i];
    else if (a === "--design-class" && i + 1 < argv.length) out.designClasses.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `consort-ux-clean – prove feature pages are reachable + consume the design guide\n\n` +
      `Usage:\n` +
      `  consort-ux-clean [--project-dir <path>] [--client-src <path>] \\\n` +
      `                          [--design-class <name> ...] [--json]\n\n` +
      `Exit 0 = clean / no client workspace; exit 1 = an unreachable or bare feature page.\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
// Resolve the design guide's declared brand app_icon so the icon contract runs in
// the CLI too (it previously ran ONLY from the review-cycle scan, which passes the
// icon explicitly) – a declared-but-unapplied brand icon must fail THIS gate, at
// acceptance, not only surface as an advisory smell.
const appIcon = readAppIconFromGuide(resolveConsortDir(p.projectDir));

const result = checkUxClean({
  projectDir: p.projectDir,
  ...(p.clientSrc ? { clientSrcDir: p.clientSrc } : {}),
  ...(p.designClasses.length ? { designClasses: p.designClasses } : {}),
  ...(appIcon ? { appIcon } : {}),
});

if (p.json) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (result.clean) {
  process.stdout.write(`ux-clean: OK – every feature page is reachable + consumes the design guide (or no client workspace)\n`);
} else {
  const blocks: string[] = [];
  if (!result.reachability.ok) {
    blocks.push(`  [reachability]\n    unreachable feature pages (not routed in App.tsx): ${result.reachability.unreachable.join(", ")}` + (result.reachability.remediation ? `\n    -> ${result.reachability.remediation}` : ""));
  }
  if (!result.tokens.ok) {
    blocks.push(`  [token consumption]\n    bare (unstyled) feature pages: ${result.tokens.bare.join(", ")}` + (result.tokens.remediation ? `\n    -> ${result.tokens.remediation}` : ""));
  }
  process.stderr.write(`ux-clean: FAILED – ${summarizeUxViolations(result)}.\n\n${blocks.join("\n\n")}\n\n${UX_CLEAN_REMEDIATION}\n`);
}

process.exit(result.clean ? 0 : 1);
