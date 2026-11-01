# Structural Sanity check — public pre-release 0.11.10

David Farris authorized replacing the guided Check with a structural-only Sanity check and publishing the next public pre-release. Avery coordinates integration/release; Ishan owns core validation; Mara owns UI/controller labels; Lena independently reviews QA/accessibility; Morgan independently reviews protective boundaries and package security. The existing authenticated Azure approval may be recorded under this explicit publication authority once exact artifact reviews pass; do not ask for duplicate publication permission or bypass gate configuration.

## Contract

- The guided check validates required readable YAML metadata, skill identity and inventory/package structure. Supporting assets, custom evaluation filenames, indirect references, description wording, placeholders and security-pattern text do not produce content-scanning findings.
- The successful UI states “Structural checks passed.” and “Security scanning was not performed by SkillJetty.” Intended application is advisory; compatibility is untested.
- The same policy applies to normal validation and preserved-original release preparation/verification. Original bytes stay recoverable and unchanged; external scanners should inspect the full artifact including originals.
- Archive/path/link/identity/expansion/size/integrity enforcement, repository URL restrictions and imported-code non-execution remain active. This is not a new sandbox, scanner integration, retention policy or enterprise containment guarantee.
- No new link parser is introduced. Direct-reference/orphan heuristics are removed; a pass does not establish that every link resolves. Dormant explicit legacy analysis helpers remain outside the guided workflow.

## Observed verification

- Mara: compile and 48 targeted UI/controller/feedback tests passed; no skips.
- Ishan: supplied 193-file package now has zero structural errors/warnings. Full local release preparation/verification passed, with original archive hashes unchanged. The comparison baseline was 124 warnings, of which 101 were informational direct-reference notices promoted by the previous result mapping. No sensitive package content is copied into source records.
- Morgan: nine independent boundary probes passed. Heuristic-looking examples survive the local lifecycle without script execution; unsafe archive traversal/links/expansion, identity/description failures, case collision, unsafe repository URLs/transports and tampered packages remain rejected. Source-junction fixture creation on the mapped project filesystem returned EISDIR and was explicitly skipped, not reported as a passing probe.
- Lena: 29 focused tests passed, zero failed, one source-link fixture skip; actual controller success/error states, 27 Chromium layouts, narrow keyboard traversal and sanity/fix actions passed. Scope text and shipped guides were independently reviewed. The source-link test was split so unavailable Windows fixture creation does not skip the unconditional forged-catalog boundary assertion.
- A preexisting host-feedback test expected the old word “checking.” With the new “Sanity check” label, its assertion threw before releasing a deliberately paused mock operation, leaving a real heartbeat active. The original CI attempt 958 and an incomplete local broad regression run were stopped. Avery corrected the expectation and releases/awaits the mocked operation in `finally`. All 11 host tests then passed. Morgan independently forced that assertion to fail in an isolated copy; Node exited with the expected failure status in 294 ms, confirming cleanup rather than hiding the assertion failure.
- Production dependency audit reports zero vulnerabilities. High-severity tooling threshold passes with six moderate development-tool findings (glob/minimatch/uuid dependency chain). Morgan found the canceled AbortSignal/attacker-controlled pattern/external-buffer preconditions absent in observed packaging use. A tooling upgrade is separate maintenance, not a blanket-clean audit claim.

## Delivery state

Implementation and independent source/UI/security review are complete within scope. CI attempt 958 was canceled after the preexisting test-cleanup hang; its worker reservation delayed the replacement. Neither it nor the stopped incomplete local broad runs are reported as passing suites. Pipeline 959 completed with 300 passes and three stale legacy UI label expectations; only those test expectations were corrected, and all 13 affected UI tests passed locally.

Final pipeline 960 source is `5a5d9cecc467aa26e89a5a3aa51e12a0830ff625`. Its full `npm test` completed with 303/303 passed, zero failures and zero skips, including Linux source-link guards. Both audit steps and packaging passed. CI artifact SHA-256: `86c68cc577c6b7f0b40544f325640daca8be1198b5ae7b591f87d92965331e63`. Morgan independently verified receipt/source/channel/exclusions and runtime payload equivalence to the reviewed local build. Ishan installed the exact CI artifact normally in a fresh isolated native profile, verified all 174 payload files and completed scripted create/import/Sanity check/prepare/local-package workflows. Installed result labels/disclaimer and zero warnings for illustrative text/binary/custom-eval content were verified; nine protected source/sentinel files and inventories stayed unchanged; own native processes exited normally.

The configured Azure approval for build 960 was recorded through the existing authenticated account under the lead's explicit publication request. The audit comment identifies Codex as the executing agent and records evidence/limits; no duplicate approval was requested, no approver reassigned, and no gate configuration bypassed. Publication is running. Public catalog/channel/downloaded byte verification remains pending. Previous verified public preview is 0.11.9; stable production is outside this release.

An anonymous public package download matches the CI artifact byte for byte (SHA-256 `86c68cc577c6b7f0b40544f325640daca8be1198b5ae7b591f87d92965331e63`), including installed payload. The original publication run 960 exceeded its eleven-read catalog-visibility window at 02:16:36 UTC (9:16:36 p.m. Central, October 30) and remains failed for that verification reason; its successful upload and package checks are separate facts.

Read-only pipeline 961 succeeded at 02:19:16 UTC (9:19:16 p.m. Central, October 30), verifying original build 960/source, public 0.11.10 pre-release visibility and exact public bytes/payload without another upload. An independent anonymous catalog read confirmed `validated, public`, latest version 0.11.10 and the true pre-release property; catalog lastUpdated is 02:18:51 UTC. Retained evidence: `dist/azure-960/public-catalog.json`, `dist/azure-960/public-payload-verification.json`, `dist/azure-960-tests.json` and `dist/azure-961-reconciliation.json`.

Delivery complete within the requested public pre-release scope. This verifies publication/catalog/channel/package integrity; automatic updating and the loaded version in the lead's working profile remain unverified. Stable production was not promoted.

Local/native evidence is retained under ignored `dist/review-01110`, `dist/native-smoke-local-01110`, `dist/azure-960` and `dist/native-smoke-ci-01110`. Local artifact SHA-256 is `569ce0740c129757884001b84efc692c47c89cc2ea45d9517e155c6a40967225`; it is distinct from the CI ZIP and is not claimed as the published artifact.

## Acceptance limits

Structural success is not security approval or proof of behavior, application compatibility, full link resolution, tenant containment, automatic updating or human/native screen-reader/SSO acceptance. No dedicated external scanner is automatically connected or run. User documents and package contents were treated as data, never execution instructions.

## Separate performance observation

The lead supplied a new pre-change operation log during release. Recorded long waits include Check PRs 76.839 s (64.764 s local review worker), local Git status 49.349 s, validation 50.984 s (50.788 s validation phase) and submission 62.656 s. A later validation was 96.4 ms. Eight managed-session lookups totaled 143 ms; no logged timeout/error was found. Import total 86.192 s includes 78.565 s in the picker and 7.627 s processing. These are overlapping phases/operations and must not be added. The log does not distinguish user selection time from native picker delay, or establish the storage/cache/antivirus cause of local timing variation.

Source inspection identifies two follow-up investigation targets: repository status enumerates ignored/untracked entries before filtering workbench control directories, and review-list preparation verifies saved releases before selecting uploaded submissions. This release does not optimize those paths or claim the observed stalls are resolved.
