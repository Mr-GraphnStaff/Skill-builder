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

The release merge `1545edaa7a253b7d9bb03431b04bf3da6d49be6c` has exactly two parents:
original main `7655c1116c014460f23fa8926dd2d6a141dc8dc8` and public pre-release
`f293bf712e50f5d262a92fc5aabcf4f2d2bf0c0e`. Stable adapters and the final fixture
correction produce artifact source `9b1bc384374548c1fe952df0889e621d3c272c40` on
`refs/heads/main`. Pre-release was neither committed nor pushed during promotion.

Production pipeline 11, build 973, failed ten legacy entrypoint fixtures that used
a preview root now correctly rejected by production. Changing only those fixtures
to a stable root resolved all ten; build 973 published nothing. Final build 974
passed **332/332 tests, zero failures and zero skips**, dependency audits and
packaging. The Linux run exercised the actual linked-path guard test; the local
Windows filesystem could not create that fixture. Local focused checks and
independent source, UI, QA and security reviews also passed within their scope.

Build 974 produced `skill-builder-0.12.0.vsix`, 734944 bytes, SHA-256
`0851739dd583e86146991969f6d594cc3f49076174bc8bc78a611fd76593286f`.
The stable identity and XML, exclusions and compiled payload were independently
reviewed. An isolated native VS Code Extension Host installed this exact artifact;
all 176 installed extension files matched. Scripted workflow, per-skill Activity
reset, early diagnostics command and absent log button passed. Nine protected
sentinel files and their inventories remained unchanged. No existing user Default
or Beta profile was used. Receipts are under ignored `dist/azure-prod-974` and
`dist/native-smoke-ci-0120`. Lena's independent QA and Morgan's artifact/security
verdicts found no unresolved publication blocker.

The existing protected production approval was approved under David's explicit Go;
no gate or approver was changed. Build 974 uploaded the reviewed package once at
2026-11-01 15:48:59 UTC. Its Publish task subsequently failed because the public
catalog visibility window expired at 15:50:56 UTC. This original failed result
remains part of the record. Read-only reconciliation verified the public stable
catalog independently at 15:55:43 UTC and exact package/catalog together at
15:55:53 UTC: version 0.12.0, validated flag 1, no rejection message and no true
pre-release property. Public SHA-256 and all installed payload files match the
reviewed artifact. `dist/azure-prod-974/final-public-verification.json` records this
result. No repeat upload or pre-release pipeline was used. Production delivery is
complete; the pipeline timeout is not represented as an all-green run.

Final local and remote branch checks before the documentation receipt confirmed
main at artifact source `9b1bc38` and pre-release unchanged at `f293bf7`, both clean
apart from this release record. The subsequent documentation-only main commit does
not change the artifact's source provenance. Original recovery copies and stash
remain preserved. Public listing:
https://marketplace.visualstudio.com/items?itemName=DavidFarris.skill-builder

Human GUI, screen-reader and live SSO/network acceptance remain separate from the
scripted native checks. David's pre-release testing is the promotion acceptance;
the scripted checks do not claim additional human acceptance. The bug-fix-only
freeze continues.
