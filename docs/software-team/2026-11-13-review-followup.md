# Pre-release review follow-up — November 13, 2026

Status: local bug fixes implemented with stated verification limits; **not release ready**.
Later validation clarified that the legacy sync/ZIP/open handlers discussed below
are not registered in this preview. Their defects were dormant, not demonstrated
reachable preview data loss. The exact VSIX and scripted native checks were
subsequently validated; the full suite remains incomplete. See
[the later validation record](2026-11-13-prerelease-validation.md).
No commit, installation, Marketplace publication, production change, or team membership change was made.
Existing uncommitted 0.15.7 work was preserved. Base HEAD: `cb04b6fe4713fc40ef65ae46847ae6b3c633bfaa`;
the reviewed candidate includes uncommitted changes and is not represented by that commit alone.

## Confirmed defects and local corrections

- Legacy Claude Code sync deleted the installed skill before copying its replacement.
  Replacement now captures bounded regular files, stages privately, retains the old directory until
  promotion succeeds, and attempts rollback on promotion failure. A failed rollback retains the old backup.
- Sync accepted a home-directory or configurable destination outside the workbench.
  Destinations now pass the workbench boundary; outside-folder installation reports unavailable.
- Legacy ZIP creation traversed the folder again through AdmZip without the newer link checks.
  ZIP entries now use checked captured bytes and safe mode metadata. Capture caps entries at 5,000,
  each file at 16 MiB, and total source bytes at 128 MiB; exceeding a cap blocks export.
- Relative editor paths now pass the existing physical-path/link guard as well as lexical checks.
- Both health surfaces now use shared credential patterns and shared bounded UTF-8 inputs, including
  extensionless files and `.env`. The patterns cover AWS access keys, generic assignments, `sk-` keys,
  GitHub tokens, and private-key headers. Files above 1 MiB are not decoded/scanned; aggregate eligible
  text above 128 MiB blocks analysis. This is heuristic detection, not assurance that a skill is secret-free.
- The local pre-release packaging command derives its filename from package name/version.
- Remote discovery now uses the shared publisher Git runner. Its unmanaged fallback still inherits user
  configuration; this is not a claim of universal Git isolation.
- The large legacy extension module was not generally refactored.

## Actual verification

- TypeScript compilation passed after the final source change.
- Final focused run: `node --test --test-timeout=30000 test/legacy-skill-files.test.cjs test/skill-analysis.test.cjs`:
  **9 passed, 0 failed, 2 skipped**. Skips: the P: volume rejected the hard-link fixture with `EISDIR`;
  Unix executable/directory permissions cannot be established on this Windows filesystem.
  Run ID: `64f637550606430eb548800c62057ae2`; results were returned in the task transcript.
- `npm audit --omit=dev` through the bundled Node npm launcher reported **0 vulnerabilities**.
- Packaging-script syntax and `git diff --check` passed. No VSIX was produced in this task.
- The required broad `npm test` started and compiled, but was interrupted before completion after slow
  Git integration checks (observed individual durations approximately 50–90 seconds). Its partial log
  remains under `working/runs/826baf1eb2574945b484c78b71370bc6/test.log`.
- A separate plugin test file exceeded an explicit 30-second test-file deadline; it did not pass.
- A separate security agent inspected the actual fixes. Its initial review caught unbounded reads and
  lost permission metadata in this task's first patch. Corrections, including private staging and root
  directory mode preservation, were separately re-inspected. This was independent static review,
  not independent executed testing or native acceptance.

Outstanding: full-suite completion, actual supported-filesystem link cases, Unix permissions, native
VS Code user flows, installed artifact verification, and Claude plugin installation/runtime acceptance.
Path/file identity checks do not establish an immutable snapshot against concurrent same-size edits.

## Historical review and evidence limits

A separate record review inspected the documented CI988 source
`b834fdabc4823c6a741bbf76d5a2cc72afd9454c`. The old sync deletion/outside-directory behavior was
already present there, despite the documented whole-workbench write promise. This is a historical
coverage gap, not merely a defect introduced by uncommitted 0.15.7 edits.

The project contains newer CI/review claims than the old README counts quoted in Claude's review.
The November 3 plugin QA record describes installed extension and Claude manifest-validation checks,
while explicitly excluding organization runtime and human acceptance. Those claims must not be
equated with a fully delivered, accepted plugin workflow.

Two raw QA receipts referenced by that record are missing. Surviving working-area control records show
their runs succeeded originally but were classified disposable and purged by required startup maintenance
on November 13 (16:34:50 and 16:35:48–49 UTC). Release evidence classification/retention was inadequate.
Missing receipts are not evidence of fabricated execution. Recovery copies were not investigated here.

These findings establish integration, assurance-coverage, and evidence-retention failures. They do not
establish individual dishonesty or authorize personnel sanctions. Staffing decisions remain with David.
