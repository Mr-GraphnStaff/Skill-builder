# Existing repository recovery — November 3, 2026

## Required behavior

- Open an explicitly configured, previously saved Skills repository directly in
  the normal Create/Open → Edit → Check → Submit workflow.
- Preserve the existing Git root, source files, drafts, saved connection, and
  private preview data. Do not adopt arbitrary folders or fabricate a marker.
- Make managed-workbench setup optional for accepted existing setups.
- Treat working files, local Git root, and GitHub remote as distinct locations.
- Validate the exact selected root/remote and revalidate configuration/trust at
  write boundaries; retain worker containment and credential isolation.
- Finish setup on selection, cancellation, or failure without waiting for an
  optional notification. Report the host's actual chooser/checking phase.
- Keep installed build, active runtime, and Marketplace channels distinct.

## Implemented recovery

`workspace-selection.ts` resolves the explicit saved mapping read-only and checks
actual Git top-level/origin. The existing layout uses its previous private data
folder; the managed layout retains its marker and repositories-folder policy.
Neither mode permits path/link redirection or an arbitrary sibling destination.

Git trust already configured by the user is projected to the exact selected
repository for internal commands. Global configuration is not rewritten; trust
changes invalidate the accepted selection. Git credentials stay in child memory
with fixed helper files inside bounded scratch, and worker paths remain inside
the private data directory for both modes.

The ordinary Start screen and truthful configuration summary return for existing
setups. Managed setup is in a closed optional disclosure. GitHub tree/blob pages
and individual skill folders receive actionable configuration errors. The header
describes the installed pre-release build instead of asserting public delivery.

## Current evidence

- Compile passed for candidate 0.15.2.
- Mara executed 54 HTML/client checks, all passed.
- Ishan executed seven compatibility checks, all passed; after the picker-promise
  timing correction, two affected checks passed. Final compatibility file has
  eight checks for independent QA.
- Morgan executed six independent security checks, all passed. Actual local Git
  and workers were exercised; authentication child options were captured with a
  fixture, not a live GitHub authentication session.
- The actual saved repository resolved read-only to the existing Git root,
  canonical GitHub remote, main branch, and existing private data directory.
- The two erroneous native preview preferences were repaired with a retained
  before-copy, before/after hashes, concurrent-edit check, and exact readback.
- Lena independently executed 49 focused host/settings/compatibility checks,
  all passed. The test process exited zero; its launcher separately flagged the
  coordinator's concurrent addition of this deliberate handoff document. That
  retained receipt is not presented as a zero-exit launcher run.
- Lena's read-only actual-workspace check passed: correct root/remote/main,
  ordinary Start actions, optional setup, unchanged settings/connection/catalog/
  Git configuration/HEAD hashes during verification, and preserved unrelated
  preferences. This is compiled-source acceptance, not native GUI acceptance.
- Final full regression, exact artifact review, public delivery and active-runtime
  verification remain pending.

## Preservation and limits

Recovery evidence and raw reports are inside ignored `working/` managed runs;
recovery runs have retention markers. No user repository was moved, reset,
reinitialized, committed, or pushed by configuration recovery. No GUI or
screen-reader acceptance is claimed. Legacy linked worktrees, redirected Git
metadata, and unconfigured arbitrary folders remain unsupported.

The previous full local run ended with one failure whose name was lost in
truncated console output. It is unresolved evidence, not a confirmed flaky test.
The next full run must retain raw output and failure details before printing a
bounded summary.
