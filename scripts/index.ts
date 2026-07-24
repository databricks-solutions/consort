// Root barrel for the substrate.
//
// The SCM + shared substrate (git / github / lakebase / util) now lives in the
// standalone @databricks-solutions/lakebase-scm-utils package. This barrel
// re-exports it so existing `.`-import consumers of lakebase-app-dev-kit keep
// resolving the same symbols during the transition. New consumers should
// depend on @databricks-solutions/lakebase-scm-utils directly.

export * from "@databricks-solutions/lakebase-scm-utils";
