# Pre-release 0.15.0 — plugin submissions and Gemini ZIP export

State: implementation and verification in progress; publication not yet verified.

## Authority and alignment

On November 3 the lead explicitly requested the complete plugin/export proposal
in pre-release, invoked Software Team 1.0.16, and directed end-to-end completion
and public availability as soon as verified. This is a scoped feature-freeze
exception and supersedes the November 2 candidate publication hold. Include the
existing managed-workbench candidate. Production and publisher transfer remain
unchanged. No organization policy, group assignment or paid service is changed.

Avery Chen coordinates/integrates/releases on Codex Windows. Ishan owns plugin
and Gemini packaging, publisher and PR contracts. Mara owns the accessible Submit
and Done UI. Morgan independently reviews security and the packaged artifact;
their separately authored CI exclusion guard is independently checked by Avery
and the full suite. Lena independently reviews QA/accessibility and coordination.
These named roles are fictional agent identities; only recorded tool evidence
establishes work. No FinOps review is triggered: no new paid service is added.

## Shared acceptance contract

- Portable remains the default and retains the established path and review flow.
- Plugin mode supports selected workbench drafts (explicitly open/import/restore
  already-authored repository or library skills first), independent bundle
  metadata/version and byte-identical member snapshots.
- Both prepares every selected portable release and the plugin before any remote
  write. It uses separate review branches/PRs with per-artifact receipts. Partial
  results never receive a completed Both verdict. Retain drafts and uploads.
- Plugin submissions use the same exact-commit verification and explicit PR
  merge/SHA-lease cleanup protections as portable submissions.
- Optional Gemini App ZIP export keeps source bytes and reports compatibility.
  Unsupported payloads block export instead of silently stripping files. Import
  and execution in a user's Google account remain unverified.
- Claude catalog sync and organization deployment/group assignment remain manual.
- Extension-owned work stays in the managed workbench. Agent scratch stays in
  checkout working/. Neither is an operating-system sandbox.

## Evidence and release ledger

- Requirements/research: ../dual-export-feature-spec.md and
  ../skills-platform-research-2026-11-03.md.
- Compile: current integrated TypeScript compile passed at 0.15.0 before final
  review fixes. Final full-suite and artifact results must be appended below.
- UI: Mara observed 31/31 focused tests before final receipt/focus adjustments;
  final integrated suite remains required.
- First controller run: 4/5 passed; stale-secondary-source case stopped correctly
  but the test's message regex failed. Regex corrected; rerun required. Its
  launcher also detected concurrently authored deliberate project documents;
  the stopped receipt is preserved, and this is not called a green managed run.
- Security review: 2026-11-03-plugin-security-review.md.
- Independent QA/accessibility: 2026-11-03-plugin-qa.md.
- Physical symlink/hardlink creation on P: may be unavailable. Record actual
  fixture skips; synthetic checks do not establish physical-link acceptance.

## Release controls

Subsequent lead steering added public-directory local preflight and listing
metadata. Actual portal rejection was traced read-only to the separate Skills
repository main SHA 6177a3ce3bdf64cb4dc11e703cbdf75b3dae6c47: the submitted
infosec-memory-core path is a release-history collection with no plugin manifest;
member source data/hub_users.db is 14,839,808 bytes and archived .skill/original
files also exceed 5 MiB. No change to that repository is authorized by this task.
The lead clarified that an external database service is prohibited by their org.
Preserve source databases; any future schema/seed/local-runtime variant is a
separate deliberate source change, must work offline in an approved environment,
and must establish storage/persistence support. No automatic conversion or
external service is part of SkillJetty export.

Use only the existing public pre-release identity and branch. Keep Marketplace
publication disabled until the exact artifact is reviewed; the lead's current
instruction authorizes the final publication through its configured gate. Do not
bypass that gate. Verify preview > production, latest-version flags and public
payload after publication. Update/read back wiki Home, Release Channels, Release
Notes and affected troubleshooting pages. Preserve prior receipts on uncertainty;
reconcile the original upload instead of blindly repeating it.

Recovery uses retained drafts/releases/receipts and a higher-numbered repair or
explicit previous-version selection. No resets, user-folder deletion or automatic
data migration. Human screen-reader/UAT and account-installed state require their
own evidence and cannot be inferred from a package or catalog result.
