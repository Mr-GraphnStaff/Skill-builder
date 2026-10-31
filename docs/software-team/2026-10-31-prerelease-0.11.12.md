# Early performance-log access — final pre-release 0.11.12

The lead reported that the performance log was unavailable until later steps.
Source inspection found that the channel already starts at extension activation,
but its only workbench button was inside workspace-dependent repository settings.
The single button and help now live in Activity, outside the busy main region and
available before a workspace is chosen. Existing immediate client/host diagnostic
bypasses and logging behavior are preserved.

David authorized this as the last pre-release change until the production
decision. Freeze further pre-release feature changes after this delivery unless
the lead changes direction. Production must expose no performance-log option:
remove the Activity diagnostics button and Command Palette command during stable
promotion, and add no diagnostics opt-in setting. The production checkout is
unchanged by this assignment. Activity remains part of the production candidate.

David subsequently confirmed the release freeze: **bug fixes only, no new
features**. Avery delivered that direction to the staffed architecture, UI, QA
and security agents and recorded it in the shared project context for handoffs.

Avery implements/integrates on Codex Windows; Lena independently reviews QA and
accessibility; Morgan reviews the exact CI artifact. Root focused checks passed
52 tests, and Lena independently passed 42 targeted tests, zero failures/skips.
The new regression covers all five steps, workspace/no workspace and busy state;
existing tests cover opening diagnostics immediately while work is pending.
An initial local full-suite run was interrupted in favor of targeted local checks
and the complete CI suite; it is not claimed as passing.

CI build 967 uses source `a5b7cf680aa3040ccb9a4677936872b6d7205940` and passed
320/320 tests, zero failures/skips, production audit and the high-severity tooling
audit. Morgan independently passed the exact artifact review: public identity,
pre-release XML, source/build binding, exclusions, icon and reviewed runtime parity.
SHA-256: `33710104e0dcc3b9782ae645859c73d63a633d04c598c08cd5c45730676c3db1`.

Normal installation of the exact CI VSIX into a disposable profile passed;
174 installed files matched the artifact. Scripted native smoke passed on
VS Code Extension Host 1.145.0-insider, including executing the diagnostics command
before opening the workbench and rendering its enabled button before choosing a
workspace. Create/import/check/prepare/local packaging passed, with nine protected
files and directory inventories unchanged and extension host exit zero.
Receipts are under `dist/native-smoke-ci-01112` and `dist/azure-967`.

The existing approval for build 967 was recorded under David's explicit publication
request, with Codex identified and actual evidence/limits in its audit comment.
Gate configuration and approver assignments were unchanged. Build 967 uploaded
once, and the public download matches the exact artifact bytes. Its eleven-read
catalog window expired at 14:31:55 UTC; that verification result remains failed.
Read-only reconciliation 968 succeeded, verifying the original build/source,
validated public 0.11.12 pre-release visibility and exact public bytes/payload
without another upload. Independent anonymous catalog read identifies 0.11.12 as
latest (lastUpdated 14:33:34 UTC). Evidence includes
`dist/azure-967/public-catalog.json`, `public-payload-verification.json`,
`final-public-verification.json` and `dist/azure-968-reconciliation.json`.
Delivery is complete for this authorized pre-release. Human GUI/screen-reader/live
SSO acceptance and production promotion remain pending. Subsequent documentation
and freeze instructions do not change the published source binding to `a5b7cf6`.
