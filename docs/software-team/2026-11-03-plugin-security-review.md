# Plugin and Gemini export security review — November 3, 2026

Reviewer: Morgan Hale, Security Architect, reporting to Avery Chen.
Runtime: Codex on Windows. Separate agent from feature implementers.

Status: feature source review and focused execution complete with stated limits;
exact candidate package inspection and final integrated release evidence pending.
No release approval is established by this record.

## Scope and authority

The lead authorized full pre-release implementation and publication in this chat.
Production and publisher-transfer scope remain unchanged. Review covers plugin
and Gemini packaging, submitted artifact identity, member snapshots, host/webview
validation, repository publication, recovery and package exclusions. Native
Claude/Gemini behavior is a separate acceptance layer.

The current checkout already had uncommitted managed-workbench changes before
this assignment. Review must preserve those changes and identify which checks
cover the integrated candidate rather than claiming a clean historical baseline.

## Required invariants

- Untrusted webview fields cannot select arbitrary source/destination paths,
  trusted artifact identity, external actions or executable code.
- Selected skills resolve from the workbench catalog and verified saved releases.
  Plugin and portable artifacts derive from captured, validated member bytes.
- Every path ancestor is checked before filesystem effects; links, hard links,
  special files, traversal, ambiguous names and duplicate identities fail closed.
- ZIP verification rejects unsafe attributes/flags as well as mismatched bytes.
- Gemini restrictions are explained without silently removing or rewriting files.
- Both prepares/verifies every requested artifact before remote writes. Partial
  results remain recoverable and are never presented as completed submission.
- Final publication uses the reviewed inventory/index/commit and rechecks current
  repository settings at the write boundary. PR/merge/cleanup are tied to the
  recorded artifact type, branch and exact commit.
- Scratch, workbench state and exported user bundles do not enter the VSIX.

## Assigned helper change and executed checks

At Avery's request Morgan authored only the package-exclusion helper change in
`scripts/ci/prerelease-release.cjs` plus its focused regression test. This code
authorship is distinct from the independent review of the feature implementation;
Avery must independently inspect this helper change.

`inspectPrerelease` now explicitly rejects `extension/working/`,
`extension/plugin-releases/` and `extension/gemini-releases/`, case-insensitively,
even if packaging-ignore configuration is bypassed. The test probes all three
directories in ordinary and uppercase forms and retains an allowed compiled
runtime-file positive case.

Executed through the owner working-area launcher:

```text
node --test test/prerelease-release-pipeline.test.cjs
8 passed, 0 failed, 0 skipped
```

The helper suite also checks existing identity/channel, source/build receipt,
public payload parity and reconciliation invariants. It does not prove that a
new final candidate VSIX contains the expected exclusions; inspect that artifact
separately after packaging.

## Findings and closure

- ZIP verifier attribute/flag gap: fixed by Ishan. Independent inspection confirms
  Unix type/directory matching, encryption/compression-method rejection, bounded
  inflate, CRC and size checks. The executed regression mutates an entry to a
  Unix symlink and updates the receipt package hash; verification rejects it.
- Per-artifact reveal: Avery matches `payload.path` to the current receipt's
  artifacts, checks the managed workbench path and requires a regular file.
  Static inspection found no arbitrary reveal path accepted by this new route.
- New repository destination: publisher inspects every ancestor in the derived
  `Plugins/<name>/<version>` path and rejects linked/non-directory ancestors.
- Plugin library identities: receipts use a separate `plugins/<bundle>` namespace;
  the release verifier derives identity and expected library path before review
  actions. The GitHub context re-verifies the artifact and selects member scalar
  identity fields for PR descriptions rather than including imported content.
- Export plan: host validates types and distinct catalog member IDs, captures and
  rechecks member inventories, prepares all artifacts before upload and reverifies
  every submission. Repository configuration guards reach final push and PR write
  boundaries. Prior uploaded branches are verified rather than blindly repeated.
- UI: metadata, members, compatibility findings and artifact paths/labels are
  escaped; output links use the existing credential-free HTTPS verifier. Structural
  checks and untested vendor runtime behavior remain distinct in the copy.

## Independent focused execution

Executed against the coordinator's compiled integrated candidate:

```text
node --test test/plugin-release.test.cjs test/prerelease-release-pipeline.test.cjs
14 passed, 0 failed, 1 skipped; command and owner launcher exit 0
Run: working/runs/a73a837f36f84f908a31fec6cfb25fae
```

The skip is the physical junction fixture (`EISDIR`); the physical hard-link
fixture also reports `EISDIR`. Those filesystem fixtures are not claimed as
executed enforcement evidence on this host. ZIP symlink metadata rejection did
execute. Snapshot/archive/handoff tampering, unsafe names/versions, duplicate
member identities, exact member bytes and Gemini unsupported-file rejection
executed successfully.

An earlier run observed the same 14 passes/1 skip but the launcher correctly
stopped because the coordinator concurrently created the deliberate delivery
record `docs/software-team/2026-11-03-plugin-prerelease.md`. No cleanup or bypass
occurred. Its receipt is
`working/.agent-control/run-ea0695bd44dc477d8db016206707bdc8.json`.
The clean rerun above supersedes that failed command, without rewriting its
historical result.

## Final verdict

No outstanding material security defect found in the reviewed feature paths.
This bounded source/focused-test review is complete with stated limitations.
Final release readiness still depends on integrated QA, exact VSIX inspection,
source/build binding and post-publication checks. No native Claude/Gemini runtime,
authenticated tenant policy, real screen-reader or human UAT acceptance is implied.

## Expanded scope: public-directory preflight

The lead subsequently requested public-directory preparation. Morgan independently
inspected the read-only preflight, bundle README, listing metadata and host/UI
wiring against the official
[pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist).

Static findings:

- Public-directory blocks/holds are advisory to private organization packaging;
  database and archive bytes remain in the member snapshot and ZIP. The report
  lists exact oversized paths, byte counts and MiB sizes without deleting files.
- A generated bundle README is outside member roots and included in the hashed
  source/ZIP inventory. Member content is not rewritten.
- Listing URLs require credential-free HTTPS. The icon must resolve to an already
  bundled relative path with a recognized image signature; no remote image fetch
  or arbitrary filesystem read was added. Full image integrity remains an
  explicitly unknown portal check.
- Repository-wide size/attribute checks, launcher behavior, name ownership,
  data handling and security scanning remain explicitly unknown/manual. Local
  file signatures and byte inspection are not represented as a security scan.
- Morgan flagged missing icon incorrectly being described as a proven directory
  blocker. Avery supplied the lead's current portal prerequisite text requesting
  an icon, while the blocking outcome remained unobserved. At Avery's request
  Morgan changed this one advisory to a warning that requires portal confirmation.
  This small review fix is authored by Morgan and needs coordinator inspection;
  the broader preflight implementation was authored by Ishan.

The earlier focused execution predates this expansion. New integrated tests and
the rebuilt exact VSIX must be checked before using it as final release evidence.
