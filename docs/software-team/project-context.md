# SkillJetty pre-release hardening — October 30, 2026

## Existing repository recovery — November 3, 2026

The owner directed repair after the optional managed-workbench feature became a
mandatory setup gate and saved repository settings were no longer usable. This
is a bug-fix recovery of the existing workflow, not a new product redesign.
Avery coordinates on Codex Windows; Ishan owns compatibility and host handling,
Mara owns UI, Lena provides independent QA, and Morgan provides independent
security review. These are agent roles, not human acceptance.

Candidate 0.15.2 restores only explicitly configured, previously saved repository
mappings with matching Git origin/root, keeping private preview data in its
existing child directory. No marker adoption, repository relocation, reset, or
automatic clone is part of recovery. Managed workbenches remain optional with
their existing restrictions. Exact-root Git operations preserve preexisting user
trust narrowly; workers retain their data-directory boundary in both layouts.

The two erroneous preview preferences identifying a skill/version folder were
restored to the verified saved repository root and remote. Original settings and
connection records are retained under ignored working-area recovery receipts.
The actual repository resolver/controller tuple passed a read-only local check.

The fresh catalog audit found public stable 0.12.2 and preview 0.15.0; the old
local 0.15.1 VSIX was not public. A later gallery installation superseded the
Default profile's local candidate. Installed files, active runtime, public
catalog and user acceptance must be reported separately throughout this repair.

Validation and delivery are still in progress. Do not describe this candidate as
running in the user's editor, publicly available, or human-accepted until the
corresponding evidence exists. Production and publisher-transfer decisions stay
unchanged. See `2026-11-03-existing-repository-recovery.md` for current evidence.

## Managed workbench candidate — November 2, 2026

The owner authorized this scoped feature exception for the next pre-release and
then requested local installation/testing before approval. Candidate 0.14.0 is
local preparation only; Marketplace publication is on hold. Production stays
unchanged. The publisher-transfer wait and existing listing remain intact.

Avery coordinates on Codex Windows; Ishan owns backend confinement, Mara owns
setup wording/HTML/docs, and Lena independently reviews QA/security/accessibility
and tests the exact installed package. These are agent role identities. Detailed
requirements, evidence and outstanding limitations are recorded in
`2026-11-02-workbench-candidate.md`. Do not infer native or human acceptance from
source tests. Existing work is preserved; unmarked folders are not adopted.

## Gear/settings consolidation — November 1, 2026

David explicitly authorized this bounded feature-freeze exception and Marketplace
pre-release publication: finish the wiki, move setup to native Extension Settings,
and retain a compact read-only Configuration summary with a gear in the workbench.
Production 0.12.1 and release source `0bbed9d` remain unchanged by this assignment.
Unrelated features remain frozen. The user's later production diagnostics decision
supersedes older notes below: hide its button and retain the Command Palette command.

Public preview 0.13.1/source `ac197a4` passed 359/359 CI tests, independent QA/security,
exact-artifact installed payload parity (179 files), and fresh scripted native
Settings/core-workflow checks. Existing connections prefill only unset Workspace
fields; saving settings does not perform repository operations. New repository URL
and local path settings are preview-specific. Explicit blanks are respected,
active edits and work folders are preserved, and final external writes check the
captured settings generation. The AI category is included. Build 977 caught a real
VS Code settings snapshot issue before publication and was canceled; replacement
build 978 passed the fresh native check. Run 978 uploaded once; its catalog wait
timed out and remains a failed task. Read-only reconciliation at 20:47:04 UTC
verified the exact public bytes/payload, latest validated 0.13.1 pre-release,
retained stable 0.12.1 and public AI category. Independent fresh-catalog VS Code
action-method fixtures enabled both channel switches at 20:47:11 UTC. Final wiki
commit `8c17858` is public; nine changed pages, heading links and six diagrams passed
browser readback. Delivery is complete with human GUI, screen-reader, live SSO and
user-computer installed-state acceptance unclaimed. See
`2026-11-01-prerelease-0.13.1.md` for the exact artifact and limitations.

## Channel-switch repair and public wiki — November 1, 2026

David explicitly authorized pre-release publication to restore missing switches.
Preview 0.13.0 is published and independently verified alongside stable 0.12.1.
Pipeline 12/build 976 source `c750ff6e` passed 328/328 tests and exact-installed
native smoke; independent security and QA passed. Publish uploaded once, then its
catalog wait expired. Final exact public payload/catalog verification passed
19:48 UTC and actual VS Code action-method eligibility passed in both directions
19:49 UTC. Home/work installed UI remains unobserved. Keep preview numerically
newer than stable, and verify both channel choices after publication.

The requested public wiki is enabled and populated with user guides, channels,
troubleshooting and release notes. Both source channels and workspace instructions
require it kept current before release completion; see `docs/wiki-maintenance.md`.
AI category is prepared in both source manifests after this build; live category
metadata editing is a separate follow-up, not a new uploaded package. Detailed
evidence/limitations: `2026-11-01-prerelease-0.13.0.md`. Bug-fix freeze continues.

## Freeze bug fix: per-skill Activity reset 0.11.13

David reported history accumulating across skills and explicitly chose a fresh
list per new skill, keeping its steps together. The bug-fix-only freeze remains
active; no feature expansion or production promotion is authorized by this fix.
Controller/UI fixes and independent source QA passed. CI969 passed 325/325 tests,
audits and packaging; independent exact-artifact review and isolated installed
native workflow smoke passed, including same-skill preservation/new-skill reset.
Build 969 uploaded once; public payload verified but catalog visibility exceeded
the original window. Read-only reconciliation 970 succeeded and independently
verified public 0.11.13 pre-release visibility and exact package bytes without
another upload. Delivery is complete; human acceptance/production promotion remain
pending. Evidence is in
`2026-10-31-prerelease-0.11.13.md`. Production still must expose no performance-log
option. Prior release records below remain preserved.

## Final pre-release change: early diagnostics access 0.11.12

**Release freeze is in effect: bug fixes only, no new features.** David explicitly
confirmed this after authorizing 0.11.12 Marketplace publication. Avery notified
the staffed architecture, UI, QA and security agents and owns carrying this rule
into future handoffs. New feature proposals remain unimplemented during the freeze.

The lead authorized moving Open performance log into Activity from the first
screen. This is the final pre-release change until the production decision;
further feature changes are frozen unless the lead directs otherwise. Production
must expose neither the performance-log button nor its Command Palette command,
and must not add a diagnostics opt-in setting. Activity remains in the production
candidate. Stable promotion awaits the lead's testing and decision.

CI967 passed 320/320 tests and audits from source
`a5b7cf680aa3040ccb9a4677936872b6d7205940`; independent exact-artifact review and
isolated native smoke passed. Build 967 uploaded once; its catalog visibility
window expired and that verification failure remains recorded. Read-only
reconciliation 968 succeeded and independently verified public 0.11.12 pre-release
visibility and exact public bytes without another upload. Delivery is complete,
with user acceptance/production promotion pending under the freeze. See
`2026-10-31-prerelease-0.11.12.md`. Prior delivery evidence below is retained.

## Current assignment: activity and performance 0.11.11 — October 31

The lead authorized implementing the performance audit recommendations and
focus/activity changes, publishing to the public pre-release Marketplace, then
testing as the candidate for the next production version. Stable publication
awaits that testing. Avery coordinates on Codex Windows; Ishan implements
host/core, Mara UI, Morgan managed Git/security and Lena independent QA/accessibility.
Source stays in the active pre-release checkout; existing work is preserved.
Detailed requirements, review evidence and delivery state are in
`2026-10-31-prerelease-0.11.11.md`. CI965 passed 319/319 tests, audits and packaging
from source `7d602a28055144048ab91c38a64fd9406fea6685`. Independent artifact review,
isolated exact-artifact native smoke and QA review passed within their stated
scope. Build 965 uploaded once; its catalog visibility window expired and that
verification result remains failed. Read-only reconciliation 966 succeeded and
independently verified public 0.11.11 pre-release visibility and exact package
bytes without another upload. Delivery is complete for this pre-release. Human
UAT, screen-reader and live GitHub acceptance remain pending before stable
promotion. The completed 0.11.10 delivery below remains historical evidence.

## Current assignment: structural-only Sanity check 0.11.10

The lead explicitly authorized structural-only Sanity check behavior and public pre-release publication. Delivery is complete: 0.11.10 is verified as the latest public Marketplace pre-release, source `5a5d9cecc467aa26e89a5a3aa51e12a0830ff625`, CI build 960 (303/303 tests, zero skips), independent QA/security/package review and exact-artifact native smoke. Build 960's publication verification exceeded its catalog window; read-only reconciliation 961 succeeded and independently verified original provenance, catalog/channel and exact public bytes/payload. SHA-256: `86c68cc577c6b7f0b40544f325640daca8be1198b5ae7b591f87d92965331e63`.

Core import/prepare/verify checks retain metadata, identity, archive and integrity boundaries without detailed security/quality scanning. The supplied 193-file package now has zero structural errors/warnings; no security or performance acceptance is implied. Dedicated external scanners remain separate and are not automatically invoked. Existing publication authority covered recording the Azure gate after independent artifact checks; no duplicate permission request was made. Human/native screen-reader/live SSO acceptance, automatic updating and the lead's loaded profile version remain unverified. Detailed evidence, prior failed/canceled attempts and separate performance observations are in `2026-10-30-prerelease-0.11.10.md`. The completed 0.11.9 assignment below remains historical evidence.

David Farris is team lead. Avery Chen coordinates integration and release on the local Windows host. This assignment uses Software Team 1.0.16, standing roster 1.0.9. Named roles are agent working identities; evidence below requires actual inspection or execution.

## Outcome and authority

The lead requested better diagnostic detail, clearer button/settings guidance, progress visible while scrolling, full team involvement, and delivery to the Marketplace. Target: public pre-release 0.11.9 of `DavidFarris.skill-builder`, from `codex/public-prerelease`, pipeline 12. Stable production promotion remains a separate decision. Reuse the active pre-release checkout; preserve other work and installations. Disposable QA belongs in ignored `dist/`.

The supplied log records 30.021 seconds processing for selecting/connecting the local project, 18.009 seconds for repository verification, 11.248 seconds preparing the sharing summary, and an incomplete submission trace. These observations do not identify authentication, network or disk as the cause. Timings overlap; nested spans must not be summed. No performance reduction is claimed by adding instrumentation.

## Requirements and owners

| ID | Required behavior | Owner | Reviewer | State |
|---|---|---|---|---|
| UX1 | Progress visible immediately and while scrolling; waiting and completion remain understandable | Mara | Lena | Passed bounded browser and UI checks |
| UX2 | Workflow and repository controls explain effects where used; keyboard and narrow layouts remain usable | Mara | Lena | Passed bounded browser and UI checks |
| PERF1 | Separate local/remote Git, authentication/API requests, worker job and phase timings | Ishan | Morgan and Lena | Implemented; runtime/privacy tests passed; no speedup claim |
| PRIV1 | Diagnostics exclude credentials, paths, URLs, skill content and arbitrary error strings; failures do not affect work | Ishan | Morgan | Independent review/tests/package check passed |
| REL1 | Tests, audits, exact package/source binding, independent review, public catalog and payload verification | Avery | Lena and Morgan | Complete: 294 tests, exact-artifact native smoke, public catalog/channel and byte parity; reconciliation 957 succeeded |

## Working ledger

- Mara owns workbench HTML and focused UI tests. Mentor influences: van Rossum/Knuth; make intent and state readable before polish.
- Ishan owns metrics, process/API timing, host correlation and worker phases. Mentor influences: Ritchie/Thompson and Carmack; measure actual boundaries without changing authentication semantics or safety checks.
- Lena owns independent QA/accessibility and coordinator peer review. Mentor influences: Knuth/van Rossum; separate static findings, synthetic browser execution and native acceptance.
- Morgan owns independent security review of diagnostics and release trust boundaries. Mentor influences: Ritchie/Thompson and Knuth; trace data and authority to the final sink.
- Avery owns scope, integration, version, documentation, package and pipeline. Independent review of implementation and coordination belongs to Lena/Morgan.

Reviews are assignment-specific, not quarterly personnel reviews. Other roster disciplines remain available; no new paid service, AI-provider integration or payroll change is part of this work.

## Release and recovery

Before publication: review final diff, compile/test, production/tool audits, package inspection and source digest receipt. Publish through the existing protected pre-release pipeline and honor its configured maintainer approval. Do not bypass an environment gate. Stop on integrity, channel or validation failures. Reconcile an uncertain publication using its original artifact; do not upload it again blindly.

Version 0.11.8 remains the previous public preview. If a material regression appears, stop promotion and publish a reviewed higher-numbered repair or explicitly select the earlier version in an isolated profile. Preserve drafts and avoid automatic channel/data migration. Package, browser, native loaded state and human acceptance are separate evidence.

## Continuation

Delivery complete within documented pre-release scope. Build 956 source is `f7d89b081fc68cfb8e9b36db3363fd58308d513a`; 294/294 CI tests, audits, artifact security check and exact-artifact native smoke passed. Its configured approval was recorded under the lead's existing explicit publication authorization, with an evidence-bearing comment identifying Codex as the executing agent. Upload succeeded, but catalog visibility exceeded that run's window, so build 956 remains failed. Read-only reconciliation 957 succeeded without uploading: original provenance, public 0.11.9 pre-release catalog visibility and exact package/payload bytes verified. A separate anonymous catalog read confirmed validated/public and latest 0.11.9. Automatic updating or loaded-version acceptance in the lead's working profile remains unverified. See `2026-10-30-prerelease-0.11.9.md` for evidence and production acceptance needs.
# Current assignment — November 3: complete pre-release 0.15.0

The lead authorized implementation and public pre-release publication of Claude
plugin bundles/submissions/Both and Gemini App ZIP compatibility export, including
the existing managed-workbench candidate. Production and publisher transfer stay
unchanged. Software Team 1.0.16: Avery integration/release; Ishan core/publisher;
Mara UI; Morgan independent security; Lena independent QA/accessibility and
coordinator review. Evidence and status: [assignment ledger](2026-11-03-plugin-prerelease.md).
No new paid services or organization-policy changes are part of this scope.

November 3 delivery: public preview **0.15.0** is validated/latest; stable remains
**0.12.2**. Build 988 uploaded the reviewed source `b834fdabc4823c6a741bbf76d5a2cc72afd9454c`;
415/415 CI tests, independent exact-package security review, 194 installed-file
parity and real Extension Host Both/Gemini plus archive/restore checks passed.
Its catalog timeout remains a failed result; read-only reconciliation 989
succeeded without another upload. Anonymous exact public bytes and latest
channel flags were verified. The actual runtime action class passed both switch
eligibility fixtures. See the assignment ledger for digests, raw evidence and
unperformed human/tenant checks. Documentation-only follow-ups preserve the
original approved artifact and source binding.
