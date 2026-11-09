# Guided repository connection release — November 9, 2026

David explicitly authorized fixing repository setup and publishing BOTH channels.
The existing Marketplace identity remains DavidFarris.skill-builder. The pending
business-publisher transfer is unchanged.

## Result

Connect repository and Change connection invoke the native guided connection flow:
GitHub root address → existing local Git copy or confirmed new clone → review the
workbench/local/remote mapping. Full paths are visible. The accepted pair is saved
together and takes precedence over stale legacy preferences. The gear remains for
advanced Settings. Sync, account switching and Open skill from repository remain
available. Cancellation and failed setup preserve accepted connections, drafts,
local repositories and historical upload identities.

The workbench holds drafts, builds, internal preparation and recovery. New local
Git mappings are separate from it. Existing work is not automatically migrated.
Stable retains its established skill interface and storage; preview-only plugin,
bundle, Gemini and managed-workbench features were not promoted.

## Exact released artifacts

| Channel | Source revision | CI build | SHA-256 |
| --- | --- | --- | --- |
| Preview 0.15.6 | 4803f8c7b2bd6daa92eaf2cd71cff8eb0bc06339 | 1085 | a00c7d5d1a3aa9bc7ba3e4e2bd43113c4a191b1b480a6035779faa73444e6835 |
| Stable 0.12.3 | 49a735107c6dfa3b89027e9e865b1321a17da71c | 1087 | bf444464679a74b76f68c21d97e21de3137d591ac87d3887acabc333b5546f0f |

Preview CI: 557 tests, 556 passed, zero failed, one platform skip.
Stable CI: 386 tests, all passed, zero skipped. Both dependency/tool audits and
packaging gates passed. Earlier failed/superseded builds were not approved for
upload. Build 1084 was canceled in favor of the final preview artifact.

Independent Morgan security checks passed 17/17 preview and 20/20 stable.
Exact artifact review matched 198 preview files and 183 stable files to reviewed
source/builds; no forbidden private state or credential-pattern findings.
Lena independently checked workflow, preservation, cross-volume clone behavior,
and stable compatibility; old UI test expectations were corrected while preserving
account-switch, Open skill, Sync and local-save behavior.

## Installed-package native verification

The actual registered command ran in a fresh isolated VS Code Insiders Extension
Host with each exact CI VSIX installed. All 198/183 installed files matched.
Both channels passed seven command checks: cancellation, matching existing Git,
origin mismatch rejection, complete-pair switching, cancellation after switching,
real fixture-backed cloning and rendered final mapping. Settings opened zero times.
Both native processes and owner wrappers exited 0.

Native picker/authentication/default-branch responses were scripted. Git clone
transport was translated to owned local fixtures. These checks do not establish
live GitHub login/upload behavior, human GUI/screen-reader acceptance or installation
on either user computer. No user editor, profile, draft or repository was changed.

Retained evidence under each channel checkout:
- Preview artifact: working/runs/ff260ff9c0ce4f52bd28abc6cd5dd5ec/
- Preview native: working/runs/8874d037688c4658874d686203bca2b5/native/
- Stable artifact: working/runs/287b5e401b9a469da747a31cdb52a4bf/
- Stable native: working/runs/481a6bc019a2479f832a4d235499fc36/native/

The stable CI receipt omits a preRelease field. The native harness accepts this
only after the VSIX XML independently verifies stable, rejects contradictions,
and retains the original receipt bytes/hash. The original receipt was not edited.

## Publication and public verification

Each version was uploaded exactly once after owner-authorized protected approval.
Preview uploaded at 22:56:04 UTC; original build 1085 retains its initial catalog
verification timeout. Read-only reconciliation 1088 succeeded, confirming the
exact public bytes without uploading again.
Stable uploaded at 23:10:29 UTC; original build 1087 retains its catalog timeout.
Its public package independently matched the exact approved bytes at 23:13:47 UTC.
Independent read-only checks at 23:19:51 UTC confirmed BOTH validated channels
and exact public package bytes. Stable 0.12.3 is highest validated stable;
preview 0.15.6 is highest validated preview and global latest. Catalog-based
switch eligibility is verified using all-version flags 2325 and VS Code's
release-selection fallback. Flags 914 identify global latest only, not a channel
pair. Neither user's installed state or human channel-switch UI is claimed.
Evidence: pre-release/source/working/runs/06a17d4bf4f349ee96322c3f577e0be6/reports/public-both-channels-verification.json.

Preview 0.15.6 remains numerically newer than stable 0.12.3. Public catalog and
isolated native results do not establish which version an open user window loaded.
Save work, update the intended channel, then Developer: Reload Window.

Nine affected public wiki pages were updated, reviewed and pushed in commit
2ea289eaad447fc8aad4aa4a889c40eb922666f4; remote HEAD readback matched.
Home, Release Channels, Release Notes, connection, getting started, folders,
layout, command walkthrough and troubleshooting reflect both verified versions.

The public guide uses generic example paths and repository names; the work-PC
screenshot's company-specific paths and repository were not published.

## Preservation and coordination

The stable checkout's original AGENTS.md owner-policy edit remains uncommitted.
The two original working exclusions were deliberately included in the stable
release. No working content was staged, committed or packaged. No user cache,
draft, package, receipt, remote origin or shared repository was deleted/repointed.
The Y: shared coordination drive was unavailable; no Claude-file notification
is claimed. Avery coordinated, Ishan implemented/native-checked, Lena reviewed
QA/accessibility/wiki copy, and Morgan independently reviewed security/artifacts.
