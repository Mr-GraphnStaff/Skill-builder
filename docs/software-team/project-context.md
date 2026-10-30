# SkillJetty pre-release hardening — October 30, 2026

David Farris is team lead. Avery Chen coordinates integration and release on the local Windows host. This assignment uses Software Team 1.0.16, standing roster 1.0.9. Named roles are agent working identities; evidence below requires actual inspection or execution.

## Outcome and authority

The lead requested better diagnostic detail, clearer button/settings guidance, progress visible while scrolling, full team involvement, and delivery to the Marketplace. Target: public pre-release 0.11.9 of `DavidFarris.skill-builder`, from `codex/public-prerelease`, pipeline 12. Stable production promotion remains a separate decision. Reuse the active pre-release checkout; preserve other work and installations. Disposable QA belongs in ignored `dist/`.

The supplied log records 30.021 seconds processing for selecting/connecting the local project, 18.009 seconds for repository verification, 11.248 seconds preparing the sharing summary, and an incomplete submission trace. These observations do not identify authentication, network or disk as the cause. Timings overlap; nested spans must not be summed. No performance reduction is claimed by adding instrumentation.

## Requirements and owners

| ID | Required behavior | Owner | Reviewer | State |
|---|---|---|---|---|
| UX1 | Progress visible immediately and while scrolling; waiting and completion remain understandable | Mara | Lena | Active |
| UX2 | Workflow and repository controls explain effects where used; keyboard and narrow layouts remain usable | Mara | Lena | Active |
| PERF1 | Separate local/remote Git, authentication/API requests, worker job and phase timings | Ishan | Morgan and Lena | Active |
| PRIV1 | Diagnostics exclude credentials, paths, URLs, skill content and arbitrary error strings; failures do not affect work | Ishan | Morgan | Review pending |
| REL1 | Tests, audits, exact package/source binding, independent review, public catalog and payload verification | Avery | Lena and Morgan | Pending |

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

Implementation and independent review are in progress. Final revision, checks, artifact digest and publication outcome will be recorded in the release report. Production readiness is not established by this assignment's start or by the lead's statement that the product is close.
