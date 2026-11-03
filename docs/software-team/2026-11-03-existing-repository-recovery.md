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

Final actual-repository review also found that ignored `working/` content caused
the old dirty check to refuse every pull. The generic repair permits unrelated
ignored private content, separately rejects incoming path collisions in both
ancestor directions (case-insensitive on Windows), and adds Git's
`--no-overwrite-ignore` guard for files created after the collision inventory.
It does not special-case an agent folder or erase ignored files. A new build and
exact-artifact review are required after this change; build 993 is retained as
an intermediate candidate, not the final publication artifact.

Recovery evidence and raw reports are inside ignored `working/` managed runs;
recovery runs have retention markers. No user repository was moved, reset,
reinitialized, committed, or pushed by configuration recovery. No GUI or
screen-reader acceptance is claimed. Legacy linked worktrees, redirected Git
metadata, and unconfigured arbitrary folders remain unsupported.

The previous full local run ended with one failure whose name was lost in
truncated console output. It is unresolved evidence, not a confirmed flaky test.
The next full run must retain raw output and failure details before printing a
bounded summary.

## Verification ledger while recovery continues

- CI build 991 ran 431 checks: 430 passed; the sole failure was an identity test
  hard-coding 0.15.0 while the candidate was 0.15.2. The corrected test checks
  numeric versioning, lockfile consistency, and the package filename; its focused
  rerun passed. Commit `58fc1a7` contains only this test correction after the main
  recovery commit `e9178e4`.
- CI build 993 passed 431/431, with production dependencies clean and the
  configured high-severity development-tool gate passing (six moderate existing
  tool findings). Its intermediate VSIX SHA-256 is
  `3ac2003e42c0bd913d8730e97d1c843ac052a6fab8623f50d90c5b34f12da3ae`.
  Receipt/source binding and all 196 installed payload files were verified in an
  isolated native test directory. This artifact is superseded by the later pull
  preservation work and must not be published as the final repair.
- The full Windows run retained its complete TAP: 419 passed, one old version-pin
  assertion failed, eleven physical/platform fixtures were skipped. The corrected
  assertion passed separately. Do not describe that historical full run as green.
- The first native attempt activated the exact 993 package and resolved its saved
  existing workspace, but its test instrumentation failed to suppress automatic
  verification. A synthetic remote read failed; no credentials or upload were
  used. That attempt is FAIL, with logs preserved. The fresh harness locates the
  actual activated module rather than preloading a duplicate Windows path-case
  module. No user editor was operated.
- The ignored-file fix passed fifteen real-Git repository checks plus one original
  ignored-overwrite regression. Four additional independent adversarial cases
  preserved ignored files and HEAD at the actual Git merge boundary.
- Security review then reproduced a separate race: another fetch could replace
  mutable `FETCH_HEAD` between inspection and merge, introducing an uninspected
  control path. The final pull repair must use an immutable, operation-specific
  fetched commit for both inspections and merge. Final security review, a new CI
  artifact, fresh native execution, and public delivery remain pending.
- Twelve older test fixture bases were changed from `dist/` to the checked
  `workingFixture` helper. Existing user files were not relocated or deleted.
- The private-fetch repair is implemented and compiled: one unique local ref,
  no shared FETCH_HEAD write, a validated immutable commit for inspections and
  merge, final origin/branch/starting-HEAD checks, and no-dereference expected-OID
  cleanup. Nine focused real-Git race/preservation checks passed. Morgan's
  unchanged original race reproduction now passes, and the four independent
  ignored-byte adversarial checks pass again. No remaining confirmed source
  security blocker was reported; the rebuilt artifact is still required.
- CI build 995 ran 442 checks: 440 passed, one Windows-only case skipped, and
  one old test expected shared FETCH_HEAD to be written. The product now
  intentionally preserves that shared record. Its corrected focused test passed,
  proving objects were fetched while HEAD, files, and the shared record were
  preserved and only the owned temporary ref was cleaned.
- Settings descriptions now distinguish the saved existing-repository layout
  from managed setup. The Default fallback root was changed narrowly from the
  unconnected Projects parent to the verified Skills root; a separate retained
  before-copy/hash/concurrency/readback receipt preserves every other preference
  and all workspace overrides. This prevents an empty/new window falling back to
  the broad parent. It does not itself update the running 0.15.0 extension.
