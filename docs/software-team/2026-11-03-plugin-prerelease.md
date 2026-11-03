# Pre-release 0.15.0 — plugin submissions and Gemini ZIP export

State: implementation/review complete; 0.15.0 uploaded, public package bytes
verified, Marketplace catalog validation/visibility pending.

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

Later owner steering requires one current active plugin folder and an archive
provision: remote plugin destination is `Plugins/<name>` with installable source
at `Plugins/<name>/source`; higher versions replace only a verified same-plugin
release through review. Local older-release archive uses a reviewable inventory,
explicit confirmation, before/after hashes, recovery receipts and collision-safe
restore. Latest versions and pending uploads are protected. Legacy Skills-repo
cleanup is not an automatic side effect and requires a separate migration.

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

## Exact CI candidate — build 988

- Source: `b834fdabc4823c6a741bbf76d5a2cc72afd9454c` on the existing public
  pre-release branch; version `0.15.0`, existing public identity.
- CI compile/full suite: **415 passed, 0 failed, 0 skipped**. Build stage passed.
  Production dependency audit: zero vulnerabilities. Packaging-tool audit:
  six moderate findings, no high/critical; existing high-severity gate passed.
- Exact CI VSIX SHA-256:
  `faac47898d3e01d8920f1eb4a66a85e9c6acae6fa762c704330d94005ce3c02f`.
  Receipt binds source, build 988, identity and pre-release channel. Downloaded
  artifact independently matched that digest. Initial download endpoint returned
  HTML and was rejected; the API-provided artifact download URL supplied the ZIP.
- Local official Claude CLI 2.1.300 strict validation passed on a generated
  two-member plugin with zero manifest errors/warnings. This alone does not prove
  organization deployment or public-directory acceptance.
- Exact artifact native Extension Host and independent package security review
  remain pending here; no publication claim follows from the passed Build stage.
- Earlier build 987 failed three workflow tests and did not publish. Portable
  reveal compatibility and the selector-aware submit harness were corrected;
  targeted rerun passed 16/16 before build 988. Interrupted/superseded local test
  runs remain retained and are not counted as passes.

## Exact artifact release reviews

- Morgan's independent package verdict: ready within reviewed scope. 196 files,
  62 compiled modules; 61 compiled files match local bytes exactly. The sole
  HTML-template module differs only by 520 CRLF bytes, with complete normalized
  text equality proven. No user databases, packages, working/recovery or local
  export payload is included. The approved package remains the exact CI VSIX.
- Lena's independent native verdict: ready within automated scope. Isolated
  installed payload parity passed for all 194 payload files (only installer
  `package.json.__metadata` excluded). Real VS Code Insiders 1.145.0 Extension
  Host passed, exit 0: explicit workbench setup, confined operations, two-skill
  Both plus Gemini (five artifacts), unchanged member bytes, and archive preview,
  confirmation and restore with newest/draft preservation and hash equality.
  Evidence: `working/runs/ce6af76ae3814c21b1d3068ad83ec848/native/native-final-receipt.json`.
- Stable VS Code's existing updater mutex blocked its first native launch;
  preserved that failed attempt and used the retained official isolated
  Insiders runtime instead. No user updater/process was reset or interrupted.
- Native physical junction/hardlink fixtures were unavailable on P: (`EISDIR`).
  CI's 415-case Linux suite had no skips. Human GUI/screen-reader acceptance,
  working-profile installed state, live SSO and Claude/Gemini tenant execution
  remain unperformed. Reviews are assignment-specific, not human UAT.

## Upload and catalog reconciliation

Configured approval `dcf6403b-5ee0-4b24-8050-a08aae2fa839` was bound to build 988
through its timeline and approval owner, then recorded through the configured
account under the lead's explicit publication instruction. Its evidence-bearing
comment identifies Codex as the executing agent and distinguishes automated
review from human acceptance. No gate was bypassed.

Build 988 uploaded once at 16:11 UTC. Its eleven catalog reads exceeded the
five-minute verification window; the build's publication check failed rather
than claiming visibility. Anonymous independent download at 16:16 UTC matched
the approved SHA-256 exactly, including every installed payload file:
`working/runs/9f9886486b1c4ba4b05e2f3f5f7f5168/reports/public-payload.json`.

Read-only reconciliation build 989 is bound to original build 988, with Build
and Publish skipped and upload disabled. No repeat upload is authorized by a
visibility timeout. At 16:19 UTC public latest-channel queries still offered
validated preview 0.13.2 and stable 0.12.2. Current pending status is published
in wiki commit `e1eb31d`. The packaged README/changelog were prepared before
publication; later source documentation points to the wiki for current status.
These documentation-only follow-ups do not alter the approved CI988 artifact.
