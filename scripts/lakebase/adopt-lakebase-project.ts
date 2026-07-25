// Kit adoptLakebaseProject: brownfield adoption with SFTDD lay-down injected.
//
// The base adoption lives in @databricks-solutions/lakebase-scm-utils and is
// SFTDD-agnostic. This kit wrapper injects the optional `.sftdd/` adoption hook
// so `enableSftdd` adoptions drop the SFTDD scaffold. assertAdoptionPreflight
// and the test fixture are pure substrate; they are re-exported unchanged.

import {
  adoptLakebaseProject as baseAdoptLakebaseProject,
  assertAdoptionPreflight,
  _testMakeBrownfieldFixture,
  type AdoptLakebaseProjectArgs,
  type AdoptLakebaseProjectResult,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { adoptSftddHook } from "../sftdd/project-sftdd-setup.js";

export { assertAdoptionPreflight, _testMakeBrownfieldFixture };
export type { AdoptLakebaseProjectArgs, AdoptLakebaseProjectResult };

export function adoptLakebaseProject(
  args: AdoptLakebaseProjectArgs,
): Promise<AdoptLakebaseProjectResult> {
  return baseAdoptLakebaseProject({
    ...args,
    adoptSftddHook: args.adoptSftddHook ?? adoptSftddHook,
  });
}
