// Kit createProject: the SFTDD-flavored project scaffolder.
//
// The base 11-step orchestrator lives in @databricks-solutions/lakebase-scm-utils
// and is SFTDD-agnostic. This kit wrapper injects the SFTDD lay-down + config
// seeding (the `.sftdd/` bootstrap + sftdd-config.json) by default, so the kit's
// lakebase-create-project CLI keeps producing SFTDD-ready projects. Callers that
// want a plain SCM project pass `sftddHooks: undefined` explicitly, or consume
// the base createProject from the substrate package directly.

import {
  createProject as baseCreateProject,
  type CreateProjectArgs,
  type CreateProjectResult,
  type ProgressCallback,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { kitSftddHooks, layDownTddScaffold } from "../sftdd/project-sftdd-setup.js";

export type { CreateProjectArgs, CreateProjectResult, ProgressCallback };
export { layDownTddScaffold };

export function createProject(
  input: CreateProjectArgs,
  progress?: ProgressCallback,
): Promise<CreateProjectResult> {
  return baseCreateProject(
    { ...input, sftddHooks: input.sftddHooks ?? kitSftddHooks },
    progress,
  );
}
