# /design pre-hook: project-specific gestures before design (optional)

**The paired-branch claim and checkout are NOT done here.** They are the drive's own
un-skippable Step 0 (`consort-drive` claims the feature through the SCM workflow —
`lakebase-scm-claim-feature-branch`, the only supported branch-creation path — AND
checks the working tree out onto the claimed paired branch, on every entry: `/design`,
`/sprint`, or a raw `consort-drive --only design`). That single owner is the one door;
it holds no matter how the lane is entered, so the corpus can never land on the tier
parent (e.g. `staging`) because a lane was entered off-branch.

This hook exists only for **optional project-specific gestures** that should run before a
design lane — e.g. claim a JIRA epic, post a "design starting" note to Slack, tag a ticket.
The kit ships it empty by design.

## Rules

- Do NOT claim the branch here, and do NOT `git checkout` / `git checkout -b` here. That
  re-creates the second door the drive's Step 0 exists to remove. The kit is the only path
  for branch creation; the SCM workflow (invoked by the drive) is how that path is enforced.
- Keep gestures idempotent and non-fatal: a failed Slack post must not block the design lane.
- `lakebase-update-commands` won't clobber a pre-hook that diverges from this default, so
  project-specific additions survive a kit upgrade.
