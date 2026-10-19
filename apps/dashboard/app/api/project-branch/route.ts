import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { projectDir } from "@/lib/consort";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/project-branch → the Lakebase branch the tests currently run on + a console deep-link,
// for the test lightbox's header chip. Reads the project `.env` (`LAKEBASE_BRANCH_ID` = the branch
// the drive points the app + tests at — the per-cycle experiment branch during a build, the feature
// branch otherwise) + `.lakebase/workflow-state.json` (the branch uid). The console URL mirrors the
// SCM extension's `getConsoleUrl`: `<host>/lakebase/projects/<projectUid>/branches/<branchUid>`; the
// project uid is resolved once via the Databricks CLI (cached, best-effort — degrade to no link).
//
// SECURITY: reads fixed files under the project root; the only shell-out is a fixed read-only
// `databricks postgres get-project` with the project slug from `.env` (no request-supplied input).

function envVal(envText: string, key: string): string {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

let cachedUid: { slug: string; uid: string } | null = null;

export async function GET(_req: NextRequest) {
  try {
    const root = projectDir();
    let host = "";
    let projectSlug = "";
    let branch = "";
    let profile = "";
    try {
      const env = readFileSync(join(root, ".env"), "utf8");
      host = envVal(env, "DATABRICKS_HOST").replace(/\/+$/, "");
      projectSlug = envVal(env, "LAKEBASE_PROJECT_ID");
      branch = envVal(env, "LAKEBASE_BRANCH_ID");
      profile = envVal(env, "DATABRICKS_CONFIG_PROFILE");
    } catch {
      return NextResponse.json({ available: false, reason: "no project .env" });
    }
    if (!host || !projectSlug || !branch) {
      return NextResponse.json({ available: false, reason: "incomplete Lakebase coordinates in .env" });
    }

    let branchUid = "";
    try {
      const ws = JSON.parse(readFileSync(join(root, ".lakebase", "workflow-state.json"), "utf8")) as {
        lakebase_branch_uid?: string;
      };
      branchUid = typeof ws.lakebase_branch_uid === "string" ? ws.lakebase_branch_uid : "";
    } catch {
      /* no uid → project-level link only */
    }

    // Resolve the project uid once (it is stable); cache it. Best-effort: if the CLI is absent or
    // auth is cold, omit the link rather than fail the chip.
    let projectUid = cachedUid?.slug === projectSlug ? cachedUid.uid : "";
    if (!projectUid) {
      try {
        const out = execFileSync(
          "databricks",
          ["postgres", "get-project", `projects/${projectSlug}`, ...(profile ? ["-p", profile] : []), "-o", "json"],
          { encoding: "utf8", timeout: 15000 },
        );
        projectUid = (JSON.parse(out) as { uid?: string })?.uid ?? "";
        if (projectUid) cachedUid = { slug: projectSlug, uid: projectUid };
      } catch {
        /* leave projectUid empty → no link */
      }
    }

    const consoleUrl = projectUid
      ? `${host}/lakebase/projects/${projectUid}${branchUid ? `/branches/${branchUid}` : ""}`
      : "";

    return NextResponse.json({ available: true, branch, projectId: projectSlug, consoleUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
