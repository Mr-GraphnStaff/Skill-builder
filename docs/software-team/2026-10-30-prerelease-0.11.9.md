# Public pre-release 0.11.9 hardening

Lead: David Farris. Integration/release: Avery Chen on the local Windows host. Source prepared for publication: `f7d89b081fc68cfb8e9b36db3363fd58308d513a`, public pre-release branch, existing `DavidFarris.skill-builder` identity. Production was not promoted.

## Delivered behavior

- Status is the first workbench content and stays visible while scrolling. Measured status height protects keyboard and anchor targets from overlap. Waiting for VS Code input, processing and completion remain distinct.
- The current task leads the screen. Optional repository/account setup is grouped, its connection state remains visible while collapsed, and contextual help explains actions, compatibility choices, saving, submission and recovery.
- Local Git, remote Git, GitHub CLI, managed-session access and HTTPS requests have separate fixed-category timings and bounded outcomes. Worker records identify jobs and validation/library/baseline/comparison/preparation phases. No credential, path, URL, content or arbitrary error text is admitted to the metric sink.
- Shipped guides now describe automatic notes, explicit version replacement/recovery, current commands and uncertain remote-write recovery.

## Independent review and evidence

Mara implemented UI; Ishan implemented runtime diagnostics. Lena independently reviewed QA/accessibility and Avery's coordination. Morgan independently reviewed security and package boundaries. Avery integrated, updated the version and guides, corrected a stale test-copy assertion and owns actual publication verification. Other roster roles were not claimed as staffed; no new paid service was introduced.

| Check | Observed result | Limit |
|---|---|---|
| Broad local suite | 292 tests: 291 passed, one stale copy expectation failed | Began before final summary update compiled; not an exact-final all-green result |
| Copy correction | Named repository guidance test passed | Test-only correction after initial package |
| Final UI focused suite | 27/27 passed | Synthetic controller/DOM tests |
| Independent Chromium | 45 layouts, six interaction cases and 12 keyboard stops passed | Synthetic browser fixtures, not native GUI acceptance |
| Independent security | 8/8 runtime/auth/privacy tests passed; no blocker found | No live SSO or remote-network reproduction |
| Dependency audits | Production audit clean; high-severity tooling threshold passed | Four moderate development-tool findings retained; Morgan found advisory preconditions absent in observed bufferless uuid.v4 usage; those packages are excluded from VSIX |
| Native integration | Fresh installed 0.11.9 activated in isolated VS Code Insiders 1.145.0; scripted create/import/check/prepare/local-package passed; protected sentinels unchanged | Scripted native Extension Host, not GUI-click/human/screen-reader/SSO acceptance |
| Native package parity | All 174 packaged extension files matched installed bytes (optional Marketplace metadata ignored) | Local package source `0ab1ba9`; later source changes only test expectation and shipped guide text |
| Exact-final CI 956 | 294/294 tests passed, both audit steps and packaging passed | Source `f7d89b081fc68cfb8e9b36db3363fd58308d513a` |
| Exact CI native integration | Fresh 0.11.9 native Extension Host activation and scripted create/import/check/package passed; 174-file parity; sentinels unchanged; process exit 0 | Isolated Insiders runtime; no human, screen-reader or live SSO acceptance |
| Exact CI security/package review | Morgan independently verified source/build/digest/channel and excluded material | Publication is a separate external action |

Local reviewed/native-tested package SHA-256: `adcd01e96edfbfdba9da810859b4ce760e76d4bfbc52a9648025f83cba1c1027`. Morgan independently matched all 46 compiled files to source output and checked exclusions. Local receipts and screenshots are retained in ignored `dist/review-0119`, `dist/native-smoke-0119`, and `dist/qa-ux-0119`.

A redundant security guard run was stopped after its first guard passed to avoid competing with the broad suite; it is not reported as a completed passing suite. Initial legacy tests used their default temporary fixtures and self-cleaned; subsequent local runs redirected TEMP/TMP into project `dist/qa-temp`.

## Delivery status

Pipeline 955 was canceled before publication to include the independently identified shipped-guide correction. Pipeline 956 built exact final source `f7d89b0` with publication enabled through the existing protected pre-release environment. Its build, 294 tests, audits and packaging passed. The CI artifact SHA-256 is `c9c9b945830d5c1084d159d7e79e0603116fb31f28a819f22170e8cc88b184b7`. Morgan independently reviewed that artifact; Ishan installed it in fresh `dist/native-smoke-ci-956` and verified all 174 payload files and scripted native workflows. Receipts bind build 956, source and artifact digest.

Ready for authorized public pre-release publication, pending the configured maintainer approval. The Publish stage is pending; Avery asked the lead to approve it in Azure. The gate was neither self-approved nor bypassed. Upload, public catalog visibility and downloaded public-payload parity remain unverified until publication proceeds. No current public-availability claim is made.

## Production acceptance and follow-through

Before stable promotion, obtain human acceptance of the native workflow, native screen-reader/live-announcement behavior, a representative live SSO/Git/API submission and error-recovery path, and representative timings from the new diagnostics. Adding observability is not a measured speedup. The prior user-observed channel-switch workaround does not establish reliable automatic updates; verify the new update/loading path in the intended profile separately.

If publication is uncertain, reconcile the original artifact and build; do not upload blindly again. Stop on identity, payload, channel or validation mismatch. Preserve previous preview/recovery material, and issue a reviewed higher-numbered repair if necessary. Stable production remains unchanged.
