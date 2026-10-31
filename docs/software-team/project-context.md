# SkillJetty pre-release hardening — October 30, 2026

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
