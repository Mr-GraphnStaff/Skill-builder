# Pre-release 0.13.1: native settings and compact workbench

David explicitly requested finishing the wiki first, then implementing and
publishing all configuration through the gear as a pre-release on November 1.
This is a bounded exception to the feature freeze; production stays unchanged.
Avery coordinates on Codex Windows. Ishan owns core settings/destination binding;
Mara the read-only display; Lena independent QA/accessibility; Morgan security.

## Wiki completed before app changes

The expanded guide was published at wiki commit `a29d1855159b4622140af3a944df235c8a172afc`.
GitHub's Mermaid renderer left blank frames during verification, so six static
PNG diagrams were added with editable Mermaid and text alternatives. Lena viewed
all six, found one label overlap, and rechecked its correction. Final wiki commit
`7648b87be58cefbb35d545307f8af3c6da31d781` was published and all six image loads
verified in GitHub. The guide defines terms, contrasts work folder/local Git repo/
remote, explains all four existing gear-settings fields, shows exact folder trees
and optional Ctrl+Shift+P steps. No app source changed until that completion.

## Authorized implementation

Native settings own setup; the workbench shows actual work folder, desired local
repository and remote, verification and a fixed gear to open Settings. Repository
operations remain explicit commands, not automatic effects of saving settings.
New repository keys are preview-specific, preserving channel separation. Existing
preview associations can be prefilled into unset Workspace keys before an operation;
explicit choices and User/Global settings are never overwritten. Existing records
remain recoverable. Empty repository address disconnects new sharing; empty local
path disables reuse while preserving remote-only upload.

Invalid explicit choices cannot fall back to uploading to an older saved remote.
Configuration generations invalidate operations synchronously; final Git/GitHub
mutation boundaries check the captured destination. Work-folder changes preserve
the active draft until reopen. Palette operations capture current in-panel edits;
opening the fixed Settings target bypasses busy queues without editing the draft.

The prior AI category source preparation is included in this preview. Version
0.13.1 is greater than stable 0.12.1 and preview 0.13.0. Final verification and
publication evidence is recorded below; production was not promoted or rebuilt.

## Native snapshot issue caught before publication

Initial source `4c9b80a80a5f53463191dc1dce1451c3e8dbf9fd` built in pipeline 12/run
977, passing 358/358 CI tests and exact-artifact review. The actual installed
native check then failed: the repository address prefilled but the local path did
not. VS Code configuration objects are snapshots; a pre-update object returned the
old URL after `update()` completed. No gate approval or upload occurred for 977;
the run was canceled and its artifact/native failure retained.

The host now reacquires settings for each prefill step, after an awaited update,
and before conditional rollback. Tests model actual snapshots rather than a live
mutable map; the two-field prefill and root-change rollback regressions pass.
Fresh compilation and independent host tests passed 22/22, with independent
security approval of the narrow correction. The required replacement same-version
build and fresh isolated native fixture passed below; earlier artifact review is
superseded.

## Replacement artifact and installed verification

Final source `ac197a4e9effad0ba30b883c6ed01f0193150f6f` was built by pipeline 12,
run 978. All 359 tests passed, with no failures or skips; audits and packaging
passed. The exact 0.13.1 public pre-release VSIX has SHA-256
`d92b56660c400cb2c5e226100a5b45ae8b3659d9c8cc6fc3e09642b552801bd4`.
Independent QA and security reviewed the replacement artifact and passed it.

A fresh isolated VS Code 1.145.0-insider profile installed that exact VSIX;
179 installed payload files matched (only installer-added package metadata was
excluded). Scripted native Extension Host checks passed the real Settings command,
both saved-connection Workspace prefills, unchanged User settings, explicit empty
repository/local choices and local packaging while disconnected. Existing cache,
selected Git repository and original workspace setting properties were preserved.
Core create/import/check/package, per-skill Activity, rename publication and tamper
guards also passed. This was scripted native execution, not GUI-click, human UAT,
screen-reader, live SSO or home/work computer acceptance.

Avery approved the existing run-978 publication gate under David's explicit
authorization after the independent verdicts. No approval policy changed. Run 977
was canceled without upload.

## Marketplace verification

Run 978 uploaded once at 20:40:35 UTC on November 1. Its five-minute public-catalog
polling window expired at 20:45:45; the original Publish task failed for that wait,
not for a rejected upload. That failure remains recorded. No second upload or
replacement publication was attempted.

Read-only reconciliation passed at 20:47:04 UTC: 0.13.1 is the latest validated
public pre-release, stable 0.12.1 remains available and unflagged, the public listing
category is AI, and the downloaded VSIX bytes and installed payload match the exact
reviewed run-978 artifact. The receipt is retained in ignored delivery evidence at
`dist/azure-prerelease-978/final-public-verification.json`.

Lena independently verified fresh catalog data at 20:47:11 UTC. Actual pinned
official VS Code gallery helpers and `TogglePreReleaseExtensionAction.update`
executed with installed stable/preview state fixtures enabled both "Switch to
Pre-Release Version" and "Switch to Release Version". This verifies action
eligibility against the current catalog; it does not establish GUI or installed
state on either of the user's computers. Evidence is retained at
`dist/channel-switch-qa/after-0131-final.json`.

## Wiki and completion

The public wiki was finalized at commit
`8c178582c2b2c26a18a51ddbde86cb0dcee5dba2`, independently matching its remote.
All nine changed public pages passed browser readback; heading links resolved and
all six diagrams loaded with nonzero dimensions. The guide covers the six settings,
exact UI field examples, work-folder/local-repository distinctions, folder layouts,
explicit operations, channel selection and troubleshooting. It labels stable
0.12.1 separately from current preview 0.13.1. Browser evidence is preserved at
`dist/wiki-delivery-0130/delivered-0131-browser-readback.json`.

Delivery is complete with the stated human GUI/accessibility/live-authentication
limitations. Stable checkout and remote `main` remain at
`0bbed9d94ea7af22fdae94d544ebb9a3f6fd5e2c`. This final documentation-only receipt
is committed on the preview branch with CI skipped; the published artifact stays
bound to source `ac197a4` and run 978.
