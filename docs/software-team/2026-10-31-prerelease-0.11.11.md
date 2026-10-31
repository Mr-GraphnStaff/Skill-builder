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

CI attempt 964 ran all 319 tests: 318 passed and one hardcoded previous-version
identity expectation failed. The expectation, local package filename and current
README version references were updated for 0.11.11. Attempt 964 published nothing.

Final CI build 965 uses source `7d602a28055144048ab91c38a64fd9406fea6685` and
passed 319/319 tests, zero failures/skips, production audit (zero vulnerabilities),
high-severity tooling audit (six existing moderate development-tool findings) and
packaging. Local full-suite attempts were interrupted due to host contention and
then superseded by this complete CI run; they are not claimed as passing suites.

Exact CI artifact SHA-256:
`097e8934948472a6e466d125cb6ce4593df9e67ecd37c8f05e05d5dbcde2e10b`.
Morgan independently verified source/build/branch binding, public identity,
pre-release flag, icon, exclusions and reviewed runtime parity. One generated
HTML runtime differs from local compiled output only in checkout line endings;
independent LF-source recompilation reproduced the CI file exactly.

The exact CI VSIX was normally installed into a disposable profile/extension
directory. All 174 installed payload files matched. Scripted native Extension
Host smoke on VS Code 1.145.0-insider passed create/import/check/prepare/local
package workflows; nine protected files and their directory inventories stayed
unchanged, with original imported source preserved and host exit code zero.
Evidence is under `dist/native-smoke-ci-01111` and `dist/azure-965`.

Chromium fixture checks confirmed Next focuses `operation-status`, 390-pixel
layout has no horizontal overflow, earlier-history reading is preserved across
updates, reduced motion disables the spinner animation, and only current status
has polite announcements. Fixture browser results are not native screen-reader
or live GitHub acceptance.

Lena independently read the final CI log, passing invalid-check regression for
both Check and Continue, and native smoke receipt; the misleading-success finding
is closed. QA verdict is ready for the authorized pre-release within stated scope.
The existing Azure approval was recorded under the lead's explicit publication
authority, with Codex execution, exact artifact evidence and limits in its audit
comment. No approver or gate configuration was changed. Build 965 uploaded once
at 13:20:30 UTC. Public package bytes match the reviewed artifact exactly. Its
eleven-read catalog visibility window expired at 13:25:39 UTC, so build 965 remains
failed for publication verification; successful upload is a separate fact.
Read-only reconciliation run 966 succeeded, verifying original build 965/source,
public validation/catalog visibility, pre-release channel and exact public
package payload without another upload. Independent anonymous catalog read now
lists 0.11.11 as latest (lastUpdated 13:29:01 UTC); final public verification
matches the artifact SHA-256 above byte for byte. Evidence includes
`dist/azure-965/public-catalog.json`, `public-payload-verification.json`,
`final-public-verification.json` and `dist/azure-966-reconciliation.json`.
Delivery is complete for the authorized pre-release; user acceptance and stable
promotion remain pending. Subsequent documentation-only receipts do not change
the published artifact's source binding to `7d602a2`.

No measured end-to-end speedup is claimed; user-workflow timing and human/native
screen-reader acceptance remain unverified. Existing production and work data are
preserved. Rollback is to select the previous verified pre-release; any corrective
publication requires a new version rather than replacing an existing artifact.

## Lead's next test

Confirm the Beta profile shows Public pre-release 0.11.11 after updating/reloading.
Use the same large IMC package and configured repository for a comparable workflow.
Check that each bottom-right Next action focuses Activity, updates explain actual
work, and scrolling back through history is respected. Keyboard and screen-reader
feedback require the lead's hands-on acceptance.

For a submission the lead chooses to make, retain the new performance log and
compare total submission time with the supplied 110.3-second observation. Separate
release preparation, review preparation, receipts, cleanup and GitHub request
durations; compare like workloads and distinguish network/cache variation.
Confirm the selected local repository's unrelated edits remain intact. A successful
pre-release run does not by itself promote the stable Marketplace channel.
