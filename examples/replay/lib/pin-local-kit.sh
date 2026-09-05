#!/usr/bin/env bash
# Single source for pinning a LOCAL-ONLY kit ref (default: sftdd-capture-local) to
# a working tree. Sourced by capture-scenario.sh (the launcher) AND the teardown/
# restart coordinators, so the wiring lives in exactly one place.
#
# A local ref exists nowhere on GitHub, so it resolves ONLY via a cache symlink
# (~/.cache/consort/<ref>/node_modules/@databricks-solutions/...).
# If that symlink is lost mid-run (an external rm, a cache sweep), lk cannot
# GitHub-re-resolve it and would hard-fail a whole capture. To make that
# recoverable, record_local_kit_hint also writes .lakebase/kit-local-dir into the
# project; the scaffolded scripts/lk shim self-heals the symlink from that hint
# (see templates/project/common/scripts/lk).

LOCAL_KIT_REF_DEFAULT="sftdd-capture-local"

# The kit package these launchers resolve. The scaffold `lk` shim is generic
# across substrate + kit, so a PRE-project call (no .lakebase/kit-package yet) must
# be told which package to load; resolve_kit_single_source exports this as
# LAKEBASE_KIT_PACKAGE for that reason.
KIT_PACKAGE_DEFAULT="@databricks-solutions/consort"

# The cache slot (node_modules/<pkg> symlink target) for a local ref.
local_kit_cache_link() {
  local ref="${1:-$LOCAL_KIT_REF_DEFAULT}"
  local cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/consort"
  printf '%s\n' "${cache_root}/${ref}/node_modules/${KIT_PACKAGE_DEFAULT}"
}

# Path to the scaffold `lk` shim a launcher invokes BEFORE a project exists (for
# --warm / lakebase-create-project). The shim used to live in-repo at
# templates/project/common/scripts/lk, but it was moved into the
# @databricks-solutions/lakebase-scm-utils substrate package (installed under the
# kit's node_modules). Return the installed path; fall back to the legacy in-repo
# location for older checkouts that still ship it.
kit_lk_path() {
  local kit_root="$1" p legacy
  p="${kit_root}/node_modules/@databricks-solutions/lakebase-scm-utils/templates/project/common/scripts/lk"
  legacy="${kit_root}/templates/project/common/scripts/lk"
  if [ ! -f "$p" ] && [ ! -f "$legacy" ]; then
    # Neither the substrate-package shim nor the legacy in-repo path exists. The
    # usual cause is that `npm install` has not been run in the kit (the substrate
    # package, which ships the shim, is not installed). Fail LOUD here rather than
    # returning a dead path and letting a later `bash "$KIT_LK" ...` die with an
    # opaque "No such file or directory".
    echo "kit_lk_path: no scaffold lk found under ${kit_root} , run 'npm install' in the kit first (expected ${p})." >&2
    return 1
  fi
  [ -f "$p" ] || p="$legacy"
  printf '%s\n' "$p"
}

# Plant (idempotent) the cache symlink -> the working tree, so a bin run finds
# dist with no GitHub install. Fails loud if the kit has no built dist.
pin_local_kit_cache() {
  local kit_root="$1" ref="${2:-$LOCAL_KIT_REF_DEFAULT}" link
  [ -d "${kit_root}/dist" ] || { echo "pin-local-kit: kit dist missing at ${kit_root}/dist , run 'npm run build' in the kit first." >&2; return 2; }
  link="$(local_kit_cache_link "$ref")"
  mkdir -p "$(dirname "$link")"
  rm -rf "$link"
  ln -s "$kit_root" "$link"
  echo "[pin-local-kit] ref '${ref}' -> ${kit_root} (cache symlink)" >&2
}

# Record the ref + recovery hint into a scaffolded project: kit-ref so the
# env-less agents resolve the ref, kit-local-dir so lk can re-plant the cache
# symlink if it is ever lost. Idempotent.
record_local_kit_hint() {
  local project_dir="$1" kit_root="$2" ref="${3:-$LOCAL_KIT_REF_DEFAULT}"
  mkdir -p "${project_dir}/.lakebase"
  printf '%s\n' "$ref" > "${project_dir}/.lakebase/kit-ref"
  ( cd "$kit_root" && pwd -P ) > "${project_dir}/.lakebase/kit-local-dir"
}

# ─── THE ONE kit resolver , every capture/replay/smoke launcher calls this ──────────────────────
# Compute the kit root ONE way + resolve the kit under the split-brain-safe policy, so orchestrator
# AND the env-less `claude -p` agents load IDENTICAL bits. The split-brain trap this closes: exporting
# LAKEBASE_KIT_DIR redirects ONLY the orchestrator; the agents do not inherit env and fall back to the
# ref-keyed cache , a DIFFERENT (often stale `main`) kit. So this NEVER sets LAKEBASE_KIT_DIR; it pins
# a local ref whose cache slot symlinks this working tree, and writes the ref into the project
# (assert_kit_single_source) so the agents resolve the same ref.
#
#   resolve_kit_single_source <start_dir> [published_ref] [local_ref]
#
# start_dir     : a dir inside the kit checkout (the caller's script dir); KIT_ROOT = its git toplevel.
# published_ref : when NON-EMPTY, the ESCAPE HATCH , validate a PUBLISHED github ref (a real remote
#                 branch/tag/sha). Exports LAKEBASE_KIT_REF and returns WITHOUT a local pin (lk resolves
#                 it from github). Use only to validate the published path; empty for local dev/capture.
# local_ref     : the local-only ref to pin when NOT publishing (default sftdd-capture-local).
#
# Exports KIT_SINGLE_ROOT + KIT_SINGLE_REF for the caller. Refuses a pre-set LAKEBASE_KIT_DIR (return 2)
# in local mode , that is the split-brain door. bash 3.2 safe (plain local + subshells).
resolve_kit_single_source() {
  local start_dir="$1" published_ref="${2:-}" local_ref="${3:-$LOCAL_KIT_REF_DEFAULT}" root
  # ONE derivation: the git toplevel of start_dir; fall back to two-levels-up (examples/replay -> root)
  # in a SUBSHELL so `pwd` runs on exactly one branch (|| + && are equal precedence, left-assoc).
  root="$(git -C "$start_dir" rev-parse --show-toplevel 2>/dev/null || (cd "$start_dir/../.." && pwd))"
  export KIT_SINGLE_ROOT="$root"
  # Tell the generic scaffold `lk` which kit to resolve for PRE-project calls
  # (a scaffolded project reads .lakebase/kit-package, but the launchers invoke
  # `lk --warm` / lakebase-create-project before any project exists). Respect an
  # already-set value so a caller can override the package under test.
  export LAKEBASE_KIT_PACKAGE="${LAKEBASE_KIT_PACKAGE:-$KIT_PACKAGE_DEFAULT}"
  if [ -n "$published_ref" ]; then
    # Escape hatch: a real remote ref, resolved by lk from github , no local cache pin.
    export LAKEBASE_KIT_REF="$published_ref"
    export KIT_SINGLE_REF="$published_ref"
    echo "[kit] published ref '${published_ref}' (lk resolves from github; no local pin)" >&2
    return 0
  fi
  if [ -n "${LAKEBASE_KIT_DIR:-}" ]; then
    echo "resolve_kit_single_source: refuse to run with LAKEBASE_KIT_DIR set , it redirects ONLY the orchestrator and leaves the claude -p agents on the ref cache (split-brain). Unset it; this pins ref '${local_ref}' for EVERYONE." >&2
    return 2
  fi
  pin_local_kit_cache "$root" "$local_ref" || return 2
  export LAKEBASE_KIT_REF="$local_ref"
  export KIT_SINGLE_REF="$local_ref"
}

# Write the ref hint into a scaffolded project (so the env-less agents resolve the SAME ref) + assert
# the shim will load THIS working tree. Fails loud (return 2) on any drift so a run can never silently
# execute a stale/other kit. A no-op in published mode (no local cache slot to check). Call AFTER the
# scaffold lands the project. bash 3.2 safe.
assert_kit_single_source() {
  local project_dir="$1" want got link
  # Published mode: KIT_SINGLE_REF is set but no cache symlink exists; nothing to pin/assert.
  [ -n "${KIT_SINGLE_ROOT:-}" ] || { echo "assert_kit_single_source: resolve_kit_single_source not called first" >&2; return 2; }
  record_local_kit_hint "$project_dir" "$KIT_SINGLE_ROOT" "${KIT_SINGLE_REF:-$LOCAL_KIT_REF_DEFAULT}"
  link="$(local_kit_cache_link "${KIT_SINGLE_REF:-$LOCAL_KIT_REF_DEFAULT}")"
  # No cache slot (published ref) => nothing to drift-check.
  [ -e "$link" ] || return 0
  want="$(cd "$KIT_SINGLE_ROOT" && pwd -P)"
  got="$(cd "$link" 2>/dev/null && pwd -P || true)"
  [ "$got" = "$want" ] || { echo "assert_kit_single_source: kit resolution drift , ref resolves to '${got:-<missing>}', expected '${want}'. Aborting so the run cannot use a stale/other kit." >&2; return 2; }
  echo "[kit] verified: ${project_dir} resolves ref '${KIT_SINGLE_REF:-$LOCAL_KIT_REF_DEFAULT}' -> ${want}" >&2
}
