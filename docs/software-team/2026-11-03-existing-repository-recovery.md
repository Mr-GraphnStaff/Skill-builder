# Existing repository recovery — November 3, 2026

## Delivery verified

**Default now has official gallery preview 0.15.2. Stable remains 0.12.2.**
Existing work stays in `P:\Projects\Skills` and its saved private preview folder;
accepted existing setups open ordinary Start with managed setup optional.

At **19:05:19 UTC**, an independent fresh public catalog read confirmed 0.15.2
as the validated latest preview and 0.12.2 as latest stable. The downloaded public
VSIX was byte-for-byte identical to the reviewed CI997 artifact. Both channel
switch action fixtures passed against the actual installed VS Code action class;
this is eligibility evidence, not a human click on the user's desktop.

The original CI997 Publish step remains failed for its catalog deadline.
Read-only reconciliation **998 succeeded**, validating original source/build and
public payload without another upload. No pipeline 11 production publication ran.

The actual Default gallery installation passed **196-file parity** and reports
`source: gallery`, `isPreReleaseVersion: true`, `preRelease: true`. The first
version-specific CLI install unexpectedly changed only the preferred channel to
release despite installing a pre-release payload. A subsequent same-version CLI
request was a no-op. Inspection of the installed VS Code implementation confirmed
that its normal toggle updates profile metadata when payload and preference
already differ. Recovery restored only that boolean to the user's recorded prior
pre-release preference, with an AST edit, full before-copy, concurrency hash,
all-other-values assertion and readback. No extension source or package bytes
were changed by this metadata correction.

Final evidence under `working/runs/`:

- Public package/catalog: `b9c753069a3d450ebe56e5af35af09fd/reports/public-verification.json`.
- Channel eligibility: `ec1adf5a5a2e46b49908d71a36bb7341/reports/channel-switch.json`.
- Read-only reconciliation: `55418283b44043c59c34ad6c6cf74917/reports/reconcile-result.json`.
- Original timed-out publication log: `b7edbbd6fc9142d8aa0d4f67cdd6a230/reports/build-997-22.log`.
- Native combined receipt: `4bb74110189c40b488536bc6c5a12d10/native/native-final-receipt.json`.
- Preferred-channel backup/repair: `eaca2b8494084f1c85b05292ced41c4c/reports/preview-preference-repair.json`.
- Actual Default gallery/parity: `95aab877dfed447d807f640e3fe136fe/reports/default-gallery-install.json`.

**Remaining user action:** save open edits and run **Developer: Reload Window**
in the existing Default window, then open SkillJetty. The running user window was
not reloaded or declared accepted. The separate Beta profile was preserved;
its earlier local candidate is not a public release. Human GUI, screen-reader,
live GitHub authentication and an actual user-repository Pull remain unperformed.

The following sections preserve candidate verification and recovery chronology;
earlier pending statuses and failed attempts are historical evidence.

## Final candidate binding

CI build **997** built source `9dada073445b2ce4661c31a2bc61f8a2fbb7b414`
as public-identity preview **0.15.2**. Its Build stage passed: **441 passed,
zero failed, one Windows-only case skipped**. The skipped case-only collision
fixture was exercised in the focused Windows real-Git checks. Production audit
found zero vulnerabilities; packaging tooling retained six moderate findings
and passed the configured high-severity gate.

Reviewed VSIX SHA-256:
`143d2f98a06051c60c9ca00f244f25b54002eb0d1ebd1da83aec486ef9f8861e`.
The receipt binds source, branch, build, identity and pre-release flag. Independent
security review matched all 32 compiled modules and 32 source maps to the reviewed
runtime, checked all 196 payload files and package exclusions, and reported no
confirmed blocker. This paragraph records candidate verification, not publication.

The actual Default settings now select `P:\Projects\Skills`, its saved preview
data under `.skilljetty-prerelease`, the root GitHub Skills repository, and main.
Retained before-copies and concurrency/hash/readback receipts are under managed
runs `629c6413d055472494ef322555b3ec39` and
`2256c4eacdf44f42ad087422926701c9`. Workspace overrides and other preferences were
preserved. No user-repository Pull, reset, checkout, commit, push, or migration
was performed as part of this recovery.

Raw final CI logs: `working/runs/26c304d336754ee5aa8f4b38ead4c328/reports/`.
Reviewed artifact: `working/runs/6d1f3f20735c4d92b2ae84af527dfce7/reviewed-artifact/`.
Independent security: `working/runs/6cb7efef48d24763842ba238879fc9e0/reports/security-readiness.json`.

The first final-artifact native attempt reached the registered Start command,
correct existing connection and optional setup UI, then failed because QA had
constructed a catalog using `format` instead of the required `version` field.
That failed process exit and fixture are preserved; the product rejection was
correct. A fresh fixture uses the owning reader to preflight the supported
schema. Native completion and public delivery are recorded below only after
their actual checks finish.

The corrected-catalog attempt subsequently completed create/check/save, then
failed a harness assertion that incorrectly expected `active.sourcePath` in the
UI projection. The owning catalog record carries that path; the UI intentionally
does not. QA retained this attempt and corrected the assertion to resolve the
actual record by its active ID, require containment, and compare imported binary
bytes. These harness failures do not count as successful native runs.

The fresh native run `4bb74110189c40b488536bc6c5a12d10/native` passed the real
Extension Host workflow with actual process exit zero. It exercised the exact
196-file verified CI997 package: registered existing-workspace startup, create,
check, local save, import with binary-byte preservation, and managed-mode
create/check/save. Actual Electron workers reported validate, snapshot, library,
prepareRelease and openPackage execution. Incremental progress, final assertions,
input/config/HEAD hashes and the process exit record are retained. Only automatic
repository verification was stubbed in this disposable fixture; no human GUI,
screen-reader, interactive sign-in, remote upload or actual user-repository Pull
acceptance is implied. The isolated Microsoft Insiders runtime was hidden and
used its own profile, extensions, caches and logs; no user editor was reloaded.

CI997 uploaded 0.15.2 once at **18:57:23 UTC**. Its Publish step then failed its
five-minute public-catalog deadline after eleven reads, despite each downloaded
public payload matching the approved artifact. That is a retained failed result,
not a green delivery assertion. Read-only pipeline **998** targets the original
997 artifact, with publishing disabled; it does not rebuild or upload the version.
Latest-channel validation and the actual Default gallery installation remain
pending until independently recorded below.

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
