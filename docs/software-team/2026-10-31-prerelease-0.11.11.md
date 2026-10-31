# Activity and repeated-work reduction — pre-release 0.11.11

David Farris authorized implementation of the team's performance recommendations,
the requested focus/activity display, and public pre-release publication. This
build is the candidate for the next production release after the lead's testing;
stable Marketplace publication is not part of this delivery.

Avery Chen coordinates on the Codex Windows host. Ishan owns host activity,
targeted release metadata and packaging; Mara owns UI/focus; Morgan owns managed
Git command reduction and independently reviews publication; Lena independently
reviews QA/accessibility and Morgan's changes. Avery integrates repository data
reuse, immutable Git tree verification, packaging and delivery. These are agent
working identities; only actual evidence below establishes verification.

## Behavior and review

- Primary step actions focus Activity once. Its bounded history survives final
  rendering, uses inert text, and pauses following while earlier entries are read.
- Structured successes come from actual outcomes. Lena reproduced a false success
  for invalid structural results; Ishan fixed both Check and Continue to submission
  and added regression coverage.
- Configured submissions seed an isolated clone from the selected local repository
  without shared object alternates or hardlinks, then fetch destination changes.
  Dirty/staged files and source settings are preserved. Local copy/checkout costs
  remain; this does not promise zero cloning work or mutate the user's branch.
- Metadata listings avoid historical package verification. The selected baseline,
  restore and publication payloads retain full verification. Packaging validates
  and packages the same captured buffers.
- Pre-push fresh file inventory and verified index-tree identity remain; committed
  tree identity replaces repeated staged/committed file rereads. Remote destination,
  branch conflict and remote commit confirmation checks remain.
- Git filter discovery remains fresh for content commands. Metadata/ref transport
  commands avoid unnecessary discovery processes. Fixed phase diagnostics cover
  packaging, receipt recording, PR preparation and cleanup.

## Verification and delivery ledger

Targeted implementation checks passed: Mara's 42 UI tests; Ishan's 63 existing
focused tests and five new regressions; Morgan's three managed-repository probes.
Lena independently passed 71 focused tests and five metadata/managed-repository
tests. Avery's publication tests passed eight cases, including stale remote base,
same-named local review branch, staged/unstaged/untracked preservation, wrong
origin, damaged releases, attributes and exact committed bytes.

Full integrated tests, artifact verification, isolated native smoke and public
Marketplace readback are pending. This ledger will be updated with exact results.
No measured end-to-end speedup is claimed; user-workflow timing and human/native
screen-reader acceptance remain unverified. Existing production and work data are
preserved. Rollback is to select the previous verified pre-release; any corrective
publication requires a new version rather than replacing an existing artifact.
