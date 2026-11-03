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

## Expanded scope: stable plugin folder and local release archives

The lead additionally directed a stable active plugin folder and explicit local
older-release archiving. Morgan independently inspected the new publisher and
`release-archive.ts`, worker/controller actions and regression-test sources.

- Stable plugin publication targets `Plugins/<name>`. Before replacement the
  existing folder must be a complete verified active plugin release with matching
  identity, payload, ZIP, receipt and handoff hashes. Legacy version folders and
  unknown/modified files are not adopted or removed. Checks remain in an isolated
  publication checkout; source working trees and Git history remain preserved.
- Morgan identified that a generic replacement flag could permit remote
  same-version byte drift or downgrades from a fresh workbench. Ishan changed
  the plugin path to require strictly newer SemVer precedence, independently of
  that flag. Identical no-ops and differing-content same-version updates stop
  before removal. Portable replacement behavior remains separate.
- Archive execution requires the host-held reviewed plan and explicit confirmation.
  It recomputes eligibility and inventories, protects newest saved versions and
  uploaded releases without verified merged/cleaned PR state, rejects tracked
  paths and nested repositories, and checks path ancestors and file types.
  Content moves use same-volume rename with before/after inventories and a
  recovery journal; there is no remote cleanup or deletion of release contents.
- Morgan identified that interrupted archives/restores could leave a preparing
  journal hidden from the recovery UI. Avery changed listing to expose incomplete
  journals and restore to reconcile matching original/archive copies before any
  write, skip already-restored matching entries and refuse divergent collisions.
  Unique temporary journal names prevent a stale temporary record from blocking
  recovery and retain orphan evidence. Static closure confirmed.

No outstanding material static finding remains in these additions. Current
compiled execution and final package inspection are still required; earlier
focused test results do not establish acceptance of this expanded implementation.

## Current integrated independent execution

Against compiled source `332d394ffe6ba4b2dd5909fb333af9521878c0f0`:

```text
node --test --test-concurrency=1 test/release-archive.test.cjs test/plugin-release.test.cjs test/prerelease-release-pipeline.test.cjs
21 passed, 0 failed, 1 skipped; command and owner launcher exit 0
Run: working/runs/3411b2dfb89040079da23365e89fcf06
Duration: 132.98 seconds
```

This supersedes earlier focused runs for the expanded plugin/readiness/archive
implementation. The 5 MiB database preservation and exact-path size report,
metadata containment/HTTPS validation, README code-fence exclusion, ZIP symlink
attribute tamper, Gemini preservation/refusal and four archive scenarios executed.
Archive scenarios include protected latest/drafts/active uploads, stale preview,
collision refusal and interrupted archive/partial-restore reconciliation.

The one skip and hard-link diagnostic remain physical-host fixture limitations
(`EISDIR`), not claimed as executed enforcement evidence. Stable active-plugin
real-Git regression and the full suite are separate coordinator/CI evidence.
Final exact CI artifact inspection remains pending.

## Final exact CI988 package inspection

Package-security verdict: **ready within the reviewed scope**. Final overall
release and publication verification remain Avery's responsibility; native smoke
and platform functional acceptance remain separate QA evidence.

- Artifact: `working/runs/ff2352c689dc4039b9ef60492d1a9a0e/ci988/skilljetty-prerelease-vsix/skill-builder-prerelease-0.15.0.vsix`.
- SHA-256: `faac47898d3e01d8920f1eb4a66a85e9c6acae6fa762c704330d94005ce3c02f`.
- Receipt verified against source `b834fdabc4823c6a741bbf76d5a2cc72afd9454c`,
  build `988`, branch `refs/heads/codex/public-prerelease` and established identity
  `DavidFarris.skill-builder`, version `0.15.0`, true pre-release channel.
- Inspected 196 files and 62 compiled files. Required plugin, export, archive,
  publisher, controller, UI and worker modules are included. Package manifest
  equals the current local manifest. Working HEAD equals the receipt's source;
  the only source-tree difference at inspection was the excluded QA document.
- No case-duplicate payload paths, parent-traversal path components or special-file
  attributes were found. The package inspector's development/user-state guards
  passed. No DB/SQLite, `.skill`, nested VSIX, recovery, scratch, working or local
  plugin/Gemini release payload was present.

Initial strict raw compiled comparison failed for exactly
`extension/out/guided-workbench-html.js`; that failed probe remains recorded at
`working/runs/8ace8da05ea44e02a1c5592421134673`. It was investigated rather than
waived: CI has 106,390 bytes and zero CRLF pairs, while the Windows local output
has 106,910 bytes and 520 CRLF pairs. Replacing CRLF with LF yields identical
complete text, with no remaining line differences. The other 61 compiled files
match byte-for-byte. This is evidence of a line-ending-only UI-template
difference, not a claim that the complete local and CI packages are byte-identical.

The full package probe then passed with that single explained comparison rule:
`working/runs/2ff998347a6a425886a33162232fdbdb`, command and owner launcher exit 0.
All identity, receipt, digest, payload exclusion and remaining byte comparisons
remained strict. The approved artifact is the exact CI VSIX above, not a rebuilt
local package. Native smoke should install that artifact.

No material package security blocker remains. This review does not assert
security scanning, authenticated Claude/Gemini tenant acceptance, human UAT or
screen-reader acceptance, and does not itself establish Marketplace publication.
