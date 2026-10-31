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

Avery implements/integrates on Codex Windows; Lena independently reviews QA and
accessibility; Morgan reviews the exact CI artifact. Root focused checks passed
52 tests, and Lena independently passed 42 targeted tests, zero failures/skips.
The new regression covers all five steps, workspace/no workspace and busy state;
existing tests cover opening diagnostics immediately while work is pending.
An initial local full-suite run was interrupted in favor of targeted local checks
and the complete CI suite; it is not claimed as passing.

CI, exact artifact/native checks and publication are pending. Human hands-on
acceptance and screen-reader behavior remain separate from automated checks.
