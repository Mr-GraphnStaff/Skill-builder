# Per-skill Activity reset — pre-release bug fix 0.11.13

During testing, David supplied a history spanning two skills and growing to the
100-entry cap. He explicitly chose **each new skill, keeping its steps together**,
rather than resetting after every action. This is a bug fix under the existing
release freeze: bug fixes only, no new features. Production promotion remains a
separate lead decision, with no performance-log option in production.

Avery owns the controller/host reset and release; Mara owns UI scroll reset; Lena
independently reviews QA/accessibility; Ishan reviewed lifecycle boundaries.
Successful skill selection retains only that opening operation's real events,
renumbers them, and rebases its completion marker. Start another and changed work
folders reset history. Checks, packaging, submission, autosave, same-active draft
resumption, and canceled/failed openings retain the current workflow's history.
A workflow generation clears inherited reading offsets without disturbing reading
position across updates or rerenders within the same skill.

QA reproduced an initial same-active-resume reset and inherited scroll offset;
both were corrected before release. Root focused checks passed 40 tests; Lena's
independent retest passed 25 focused tests, zero failures/skips, and closed both
findings. CI969 passed the complete 325-test suite, zero failures/skips, audits and
packaging from source `15b7ca6aaa9c1f212a17e4427fc2fcbc5c3d84b5`.

Morgan independently passed exact artifact review: public identity 0.11.13,
pre-release XML, source/build binding, exclusions and reviewed runtime parity.
SHA-256: `203660a7ffefc2b65e5b145aac2cf534c1201ca6a94315079b16e43cac187f35`.
All 174 normally installed payload files match the CI artifact in the disposable
native profile. Scripted native VS Code Extension Host smoke passed create,
check, local packaging, same-skill continuation, start another and opening another
skill; its assertions verified preserved same-skill history/generation and fresh
new-skill numbering without old events. Nine protected files/directory inventories
were unchanged and the host exited zero. Human GUI/screen-reader/live GitHub
acceptance remains separate. Receipts are under `dist/native-smoke-ci-01113`.

The existing publication gate was approved under the lead's standing explicit
pre-release authority, identifying Codex and actual evidence/limits in the audit
comment. No gate configuration or approver assignment changed. Build 969 uploaded
once and verified the public package payload, but its eleven-read catalog window
expired at 14:58:47 UTC. That publication-verification failure remains recorded.
Read-only reconciliation 970 succeeded, verifying original build 969/source,
validated public 0.11.13 pre-release visibility and exact public bytes/payload
without another upload. Independent anonymous public verification also passed.
Evidence includes `dist/azure-969/public-catalog.json`,
`final-public-verification.json` and `dist/azure-970-reconciliation.json`.
Delivery is complete for this pre-release bug fix; human acceptance and production
promotion remain pending under the freeze. Subsequent documentation receipts do
not alter the published source binding to `15b7ca6`.
No data files or performance log history are
deleted by this change; only the in-memory Activity list resets. The freeze is also
recorded in the project-wide workspace `AGENTS.md` for both channels.
