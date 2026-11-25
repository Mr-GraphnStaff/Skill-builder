# Pre-release validation — November 13, 2026

Verdict: **not ready for public pre-release**. The exact package and scripted
installed-extension checks passed, but complete automated-suite verification is missing.
No assertion failure was observed in the final candidate's bounded test runs.

## Candidate and scope

- Existing checkout/branch: `pre-release/source`, `codex/public-prerelease`.
- Version/identity: `0.15.7`, `DavidFarris.skill-builder`; existing publisher retained.
- Base HEAD: `cb04b6fe4713fc40ef65ae46847ae6b3c633bfaa`, plus preserved and reviewed
  uncommitted changes. That commit alone does not represent this candidate.
- Source/compiled aggregate from QA, unchanged before/after testing:
  `0bee84d007acf13c15a3f88a78263d99f0f436cfabbad54bd643fa728b1285bd`.
- VSIX: `dist/skill-builder-0.15.7.vsix`, 860,328 bytes, 205 files.
- SHA-256: `2fc999742cf287d00ed3dd09b4a8979157eda8aa5bfd04ed7b9cf9678821a58b`.
- No commit, push, production change, Marketplace publication, publisher migration,
  team-membership change, or installation into an existing user profile occurred.

## Corrections made during validation

The advertised nested-repository repair was missing its implementation. Baseline
connection tests reproduced two failures and eleven passes. The local correction now
accepts a distinct ancestor repository, rejects equal roots/repositories inside the
workbench, refuses tracked private workbench files, adds an escaped local ignore rule
only after confirmation, and rechecks that protection for saved connections. It preserves
the existing index, tracked `.gitignore`, configuration pins, and cancellation behavior.
The native confirmation now explains the possible local ignore addition.

The README incorrectly described 0.15.7 and 0.12.4 as published. It now identifies
0.15.7 as an unpublished local candidate. The packaging identity test was updated to
exercise the dynamic filename script, a changed version, and nonzero exit propagation;
its two cases passed. No checks were weakened to force a readiness verdict.

Important correction to the earlier review: preview activation returns immediately
after starting the guided workbench. The old sync, ZIP, relative-open, and remote-lookup
handlers are not registered; their functions are not exported. Those findings described
dormant legacy implementation defects, not demonstrated reachable data loss in this
preview. Shared analysis code remains active. The earlier local hardening is retained.

## Executed checks

| Check | Observed result |
| --- | --- |
| Compilation and local pre-release package command | Passed; exact VSIX above produced |
| Independent source review | No unresolved concrete blocker in inspected final diff |
| Independent exact-artifact inspection | Passed public identity, version/XML pre-release flag, manifest/icon/branding, payload inventory, exclusions |
| Compiled artifact parity | All 70 packaged runtime/map files match current `out/` bytes |
| Installed payload parity | All 203 installed payload files match the VSIX; only VS Code's optional manifest metadata is disregarded |
| Focused ancestor acceptance | Three original new cases passed after correction |
| Focused privacy regressions | Three cases passed; Unix literal-backslash case requires Unix execution |
| Production dependency audit | Zero vulnerabilities |
| Full `npm test` attempt | Incomplete at 20-minute external monitor limit; 397 executed passes and seven skips reported, no final suite totals |
| Source-bound 22-file continuation | Incomplete at 15-minute external monitor limit; 23 reported passes, no final suite totals |
| Combined case-title evidence | 408 distinct executed-pass titles and seven skips; not complete suite totals |

Twelve continuation cases overlap the original run. **123 literal cases across 20
files remain unreported**, including publisher, repository security/connection, and
workbench groups. There is no successful full-suite exit to cite. Source remained
unchanged; no assertion failure was reported in these final-candidate runs. Slow Git
fixtures and buffered output were observed; their exact environmental cause was not proven.

### Exact installed-package native checks

VS Code 1.145.3 ran the exact installed candidate in an isolated profile and extension
directory under `working/`. Seven scripted checks passed:

1. Installed payload parity.
2. Actual activation/command registration, including absence of legacy sync registration.
3. Open Workbench uses the marked fixture folder.
4. Canceling ancestor-repository confirmation preserves mapping and ignore rules.
5. Confirming the ancestor mapping discloses and adds the local privacy rule.
6. Installed controller/worker code saves two portable skills and one plugin locally.
7. Saved plugin ZIP and release manifest reverify.

The final native process and owner wrapper exited zero. The test window is closed.
The run scripted picker/authentication responses and the default-branch lookup;
actual local validation, confirmation handling, storage, worker execution and export
code remained in use. It did not establish live GitHub authentication/upload, human
webview interaction, screen-reader acceptance, or either user's existing installed state.

Earlier harness attempts are retained. They encountered an assumed CLI-path error,
fixture Git ownership, the Codex/VS Code sandbox access conflict, eager proposed-API
getter evaluation, Windows path casing, and a missed fake-repository branch hook.
The successful run used the installed `code.cmd` launcher and normal user context;
no application ACLs or existing profiles were changed and no proposed API was enabled.
The candidate package stayed unchanged throughout these harness corrections.

### Claude validation

An export generated by the exact installed runtime passed
`claude plugin validate <source> --strict --json` using Claude Code **2.1.318**.
The strict manifest result had no errors or warnings. Its separate directory assessment
noted a missing optional listing icon, and README install-line advice was non-gating.
This was not a directory-profile certification, organization installation, or model
behavior test. No model was invoked. CLI configuration and temporary files were isolated
inside the retained working run; auto-updates and nonessential traffic were disabled.

## Retained evidence

All paths below are relative to this checkout and excluded from Git/VSIX packaging:

- Build: `working/runs/d617f9d63c204d1e943b9d87508c4c7f/package.log`.
- Artifact review: `working/runs/3ee32c48aa68450bb153f265d2d73275/` (tool output also in chat).
- Native: `working/runs/dc9e799fccc14d89849860664b3429b8/native/native-fixture-resolver/native-receipt.json`.
- Native harness and earlier attempt logs: same retained `dc9e.../native/` directory.
- Immutable evidence copy: same directory's `reviewed-skill-builder-0.15.7.vsix`
  and `reviewed-artifact.json`; source/copy hashes were both checked against the
  reviewed SHA-256. This preserves the inspected bytes if `dist/` is rebuilt later.
- Export/Claude validation: `working/runs/9b1b363e4817442baecaa9b38da48417/offline-claude-receipt.json`
  and `claude-validation.stdout.json`.
- Original full-suite log: `working/runs/a5c93cc8953244389fb4155ef21af4db/npm-test.log`.
- Audit/coverage/source binding: `working/runs/7fbbe11447c94ce6b3f5aeb88d09457c/`.
- Continuation result, exact file list and log: `working/runs/17e59bb9f3874b198546ab9bc67d8a79/`.
- Proven continuation cleanup: same run's `job-smoke-proof.json` and control record.

The original monitor's timeout cleanup failed. Later exact-run environment and
creation-time checks identified and stopped its owned orphans. Known runtime rescans
found zero exact matches; five inaccessible process-inspection gaps were disclosed.
The continuation used a separately smoke-proven nested `KILL_ON_JOB_CLOSE` job and
finished with zero remaining owned processes and zero unexpected outside files.
These operational failures were not converted into passing test results.

## Open release gate

Complete the entire automated suite against this exact candidate in a supported,
adequately performing environment, retaining final exit/totals and source binding.
Do not relabel the two time-limited runs as a completed suite. Current source is
uncommitted, so a CI run of an older remote revision would not close this gate.
Unix permission/backslash and unsupported physical-link cases remain explicit
coverage limits. Update the release wiki with verified status when the release
proceeds; the public pages checked today still describe 0.15.6/0.12.3.

Readiness assessment is complete with these limits; publication is not approved or performed.
