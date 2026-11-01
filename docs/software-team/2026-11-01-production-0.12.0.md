# Production promotion 0.12.0

On November 1 David directed promotion of tested pre-release 0.11.13 to release,
then explicitly authorized proceeding including Marketplace publication.
His diagnostics decision, "In production, hide the button add to the cmmnd palette",
supersedes the earlier no-command requirement: retain local recording and Command
Palette access, remove the workbench button, and add no opt-in setting.
The bug-fix-only freeze remains active; this promotes the existing tested feature set.

Avery coordinates on Codex Windows; Ishan owns stable data adaptation and original
work reconciliation; Mara UI/diagnostics; Lena independent QA/accessibility; Morgan
independent security and exact-artifact review. Stable remains DavidFarris.skill-builder;
pipeline 11 is used, publishing its exact reviewed stable VSIX after the existing gate.

## Preservation and integration

Release main began at `7655c1116c014460f23fa8926dd2d6a141dc8dc8` with 17 dirty or
untracked source/test files. Before integration, raw copies, SHA-256 inventory and
binary index/worktree patches were saved under ignored
`dist/recovery/promotion-2026-11-01`; Lena independently verified all 17 hashes.
The changes remain in local stash `26033679ff3d14f1ab5fd3d27cc78845f38570b2`.
No recovery entry was dropped. Ishan's per-file reconciliation is in that folder.
The merged source is the existing public pre-release branch at
`f293bf712e50f5d262a92fc5aabcf4f2d2bf0c0e`, including tested runtime `15b7ca6`.
Archived private checkouts/history and work data are not promotion inputs.

Stable adaptation uses the selected/configured root directly and retains explicit
stable directory settings with path/link guards. Preview/control/Codex roots are
rejected; no automatic data migration occurs. Activity/reset behavior and tested
repository/package protections are preserved. Production diagnostics are local;
the command remains immediately available while a task runs, with no button.

## Verification and delivery

Source QA, CI, exact stable artifact/native checks and publication are in progress.
Actual test results, artifact source/digest and public verification will be recorded
before reporting delivery complete. Human screen-reader/live SSO acceptance remains
separate from scripted checks. Existing protected user profiles are not smoke targets.
