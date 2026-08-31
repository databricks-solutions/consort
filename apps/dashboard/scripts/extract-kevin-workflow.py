#!/usr/bin/env python3
"""Extract the WORKFLOW literal from Kevin's build_dashboard.py into a JSON fixture.

The fixture (lib/__fixtures__/kevin-workflow.json) is what lib/topology.test.ts asserts
lib/topology.ts against, so that a mis-transcribed match predicate or step id is caught
rather than agreed with. It is committed precisely so the test suite needs neither Python
nor a copy of Kevin's file on a clean clone — this script only runs when re-syncing to a
newer version of his dashboard.

Usage:
    python3 scripts/extract-kevin-workflow.py path/to/build_dashboard.py

Then run `npm test`. If the topology tests fail, either lib/topology.ts needs updating to
match his new data, or the difference is a deliberate correction — in which case add it to
INTENTIONAL_DEVIATIONS in lib/topology.test.ts with the evidence for it.
"""

import argparse
import ast
import hashlib
import json
import pathlib
import sys

FIXTURE = pathlib.Path(__file__).resolve().parent.parent / "lib" / "__fixtures__" / "kevin-workflow.json"


def extract_literal(src: str, symbol: str = "WORKFLOW") -> tuple[str, int]:
    """Return the source text of `symbol`'s dict literal, plus its 1-based line number."""
    marker = f"{symbol} = {{"
    try:
        i = src.index(marker)
    except ValueError:
        sys.exit(f"error: could not find `{marker}` — has the symbol been renamed?")

    start = i + len(f"{symbol} = ")
    depth = 0
    for j in range(start, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start : j + 1], src[:i].count("\n") + 1
    sys.exit("error: unbalanced braces — the literal never closes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=pathlib.Path, help="path to build_dashboard.py")
    ap.add_argument("--kit-describe", default="v0.3.6", help="kit version the source came from")
    ap.add_argument("--kit-commit", default="cad5f5fb", help="kit commit the source came from")
    args = ap.parse_args()

    if not args.source.is_file():
        sys.exit(f"error: no such file: {args.source}")

    src = args.source.read_text()
    literal, line = extract_literal(src)

    # literal_eval, not eval: this is someone else's source file, and we only want data.
    workflow = ast.literal_eval(literal)

    for key in ("nodes", "edges", "phaseToNode", "lanes"):
        if key not in workflow:
            sys.exit(f"error: WORKFLOW is missing `{key}` — the schema changed, update the test too")

    payload = {
        "_comment": (
            "Verbatim extraction of WORKFLOW from Kevin Hartman's build_dashboard.py, via "
            "ast.literal_eval of the source literal. Do not hand-edit. Regenerate with "
            "scripts/extract-kevin-workflow.py. Guards lib/topology.ts against transcription "
            "drift; intentional deviations are declared in topology.test.ts."
        ),
        "_source": {
            "file": args.source.name,
            "symbol": "WORKFLOW",
            "line": line,
            "literal_sha256": hashlib.sha256(literal.encode()).hexdigest(),
            "kit_describe": args.kit_describe,
            "kit_commit": args.kit_commit,
        },
        "nodes": workflow["nodes"],
        "edges": workflow["edges"],
        "phaseToNode": workflow["phaseToNode"],
        "lanes": workflow["lanes"],
    }

    FIXTURE.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {FIXTURE.relative_to(pathlib.Path.cwd())}")
    print(f"  from {args.source}:{line}  sha256={payload['_source']['literal_sha256'][:16]}")
    print(
        f"  {len(workflow['nodes'])} nodes, {len(workflow['edges'])} edges, "
        f"{len(workflow['phaseToNode'])} phases, lanes: {', '.join(workflow['lanes'])}"
    )


if __name__ == "__main__":
    main()
