# SkillJetty pre-release 0.15.8 — November 25, 2026

Verdict: delivered and publicly verified. The owner explicitly authorized updating
pre-release DevOps artifacts and Marketplace publication. Stable and the pending
publisher-transfer decision were not changed.

## Behavior

- Open Claude-format `.plugin` and plugin ZIP archives from third parties. Keep
  original bytes separately and preserve complete editable components and metadata.
- Export or upload the opened copy without selecting its folder again.
- Explicitly replace the same or an older plugin version from bundle builds or
  plugin-folder actions. Keep prior packages/publication/review receipts for
  recovery, retain normal Git history, and require PR review/merge.
- Retain archive/path/link/size/credential/configuration guards. Imported scripts
  are not executed. The VSIX inspector independently rejects plugin user state.

## Source and exact artifact

- Runtime source: `076f8ed0af3264a2ff22e223df845dbc63b65afc`,
  `codex/public-prerelease`, existing public identity `DavidFarris.skill-builder`.
- Pipeline 12: **SkillJetty Pre-release Build and Publish**, original build **1206**.
- Artifact: `skilljetty-prerelease-vsix/skill-builder-prerelease-0.15.8.vsix`.
- SHA-256: `cdab8cd982b3f152b92a3bf4705cc5ac6cf89c1f9c2eaae89f08ad9dd56b77ef`.
- Size: 869,469 bytes; 205 VSIX entries, 203 installed payload files.
- Artifact receipt binds source, build ID, branch, public identity and pre-release
  flag. Azure retention lease **632** protects build 1206 through November 2,
  2126, without preventing pipeline deletion. Local evidence has retain markers.

## Verification and actual limits

| Check | Observed result |
|---|---|
| Final committed full CI suite | 577 executed: 576 passed, zero failed, one skip |
| Platform skip | Windows-only case-insensitive ignored-file collision test on Linux |
| Production dependency audit | Zero vulnerabilities |
| High-severity tool audit | Passed; six moderate findings retained, follow-up 421 |
| Focused local regression run | 33 passed, zero failed, one platform skip |
| Exact installed-artifact native checks | Ten scripted checks passed; native process exited zero and window closed |
| Installed payload parity | All 203 files match CI VSIX, allowing VS Code manifest metadata |
| Separate QA/accessibility review | Lena independently recomputed digest/parity and inspected final source/UI; no blocker |
| Separate security review | Morgan Hale inspected final diff and all 205 artifact entries; no blocker |
| Public package/payload | Exact ZIP bytes and installed payload match approved artifact |
| Public catalog | Validated/latest pre-release 0.15.8; stable 0.12.3; latest-only query offers preview |
| Channel switching | Catalog eligibility confirmed by same identity, flags and preview > stable ordering |

Native checks exercised activation/commands, marked workbench opening, canceled
and confirmed ancestor-repository privacy handling, Both exports, third-party
plugin import with metadata/components, export of the same copy, and recoverable
same-version replacement. Picker/authentication/API/default-branch responses were
scripted. These checks do not establish live GitHub writes, human keyboard or
screen-reader UAT, Claude installation/execution, or either existing user profile.
Human acceptance remains Azure item **355**. Six moderate build-tool findings are
Azure item **421**; implicated VSCE/Azure/MSAL/UUID packages are absent from the VSIX.

Initial CI1205 passed 575 tests and failed one original-preservation copy assertion;
the explicit wording was restored before fresh CI1206. The slow original local
Windows broad run contained earlier UI-contract assertions and was stopped after
the final source-bound Linux CI completed. It is retained as partial evidence,
not relabeled as a successful local full suite.

## Publication chronology

1. Protected approval `6c7e626f-fa78-4906-9f1b-5d30ce470b05` was recorded under
   the owner's instruction, identifying Codex and the actual CI/native/review evidence.
2. Build 1206 uploaded once at **13:05:11 UTC**. Public payload reads matched,
   but catalog visibility exceeded its bounded window. Build 1206 remains failed.
3. Read-only reconciliation **1207 succeeded**, verifying original provenance,
   successful Build stage and exact public package/catalog at **13:14:24 UTC**.
   No upload occurred during reconciliation.
4. Separate anonymous verification at **13:16:22 UTC** confirmed identity, version,
   validation/pre-release flags, latest-version queries, preview > stable ordering,
   name/description/icon and exact public package/payload parity.

The public wiki Home, Release Channels, Release Notes, Getting Started,
Troubleshooting, Plugin Exports and Concepts/Folders pages were updated together.
Final wiki commit: `d8499c6fc491aaa7160f7fad724a5e82be926b9f`. Release tracking is
Azure task **420** under delivery feature **351**. Historical setup tasks stay
closed; human UAT and build-tool maintenance remain separate open work.

## Retained local evidence

Paths below are checkout-relative and excluded from Git and VSIX packaging:

- `working/release-0.15.8/ci1206/`: original CI VSIX and receipt.
- `working/release-0.15.8/artifact-verification.json`.
- `working/release-0.15.8/native/ci1206/native-receipt.json` and native logs/harness.
- `working/release-0.15.8/lena-review.md`, `morgan-review.md`, `review-verdicts.json`.
- `working/release-0.15.8/approval-result.json`, `build-retention.json`.
- `working/release-0.15.8/public-verification.json`, public catalog and public VSIX.
- `working/runs/ba9fe38dbf7e469f96c584e05c0339d2/focused-tests.log`.
- `working/runs/019abf33dd724b3a9acad838b3d8e293/tests.log`: original partial broad run.

Earlier local `dist/skill-builder-0.15.7-plugin-import-override-2026-11-25.vsix`
is a preparation artifact, not the published 0.15.8 package.
