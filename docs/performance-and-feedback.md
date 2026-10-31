# Responsive workbench and activity feedback

## Public pre-release 0.11.11: activity and less repeated work

Advancing a step moves focus to the Activity area. Its current message announces
meaningful updates; a bounded scrolling history retains working, waiting,
completed and failed stages. Updates do not repeatedly take focus. Reading older
entries pauses automatic following, and elapsed-time updates remain silent.
Success markers require an observed successful result; structural findings show
that attention is needed. This is activity reporting, not a percentage estimate.

Submissions reuse downloaded objects from the configured local repository in an
isolated publication copy, then fetch the latest destination branch. The selected
repository's files, staging index, branch and settings are preserved. This avoids
a full remote clone on each configured submission, but still copies local Git
data and writes the isolated checkout. Submissions without a configured local
repository retain the independent-download path.

Guided saved-version listings read bounded metadata rather than reopening every
historical archive. The selected comparison or action still verifies its release
payload. A listed version is not a new integrity certification. Packaging uses
one captured source inventory; publication retains the reviewed Git tree identity
instead of repeatedly rereading the same bytes to prove unchanged blob identities.

Repository verification avoids filter-discovery subprocesses for commands that do
not process working-tree content. Content operations still disable configured
filters immediately before use. Fixed diagnostic phases now include release
preparation, PR preparation, receipt recording and local cleanup, so waits around
PR creation can be distinguished from GitHub API time.

No end-to-end speedup percentage is claimed. The lead's supplied large-package
submission spent 5.4 seconds cloning out of 110.3 seconds overall; the remaining
work needs comparable real-workflow measurements. Native assistive-technology
acceptance and the lead's pre-release testing remain separate from automated checks.

## Public pre-release 0.11.9: explain the wait

Operation status begins at the top of the workbench and stays visible while scrolling. Contextual help explains workflow actions and optional repository/GitHub settings. A file picker or account selection is a request for your input, distinct from processing; elapsed time and host responses do not imply a percentage complete.

Open **SkillJetty: Open Workbench**, then **Open performance log** to inspect the local **SkillJetty — Pre-release Performance** output channel. Each foreground operation has an ID; startup repository verification is correlated separately. Git diagnostics distinguish local commands from remote operations. Managed GitHub session acquisition is timed separately from API requests, including bounded HTTP outcomes and timeouts. Background worker records identify the job and measured phases. Repeated calls appear as repeated records; an error or timeout is not automatically described as a retry.

These diagnostics use fixed categories and numeric/boolean fields, never command arguments, repository URLs, filesystem paths, tokens, request bodies, response bodies or arbitrary error text. They stay in the local Output channel. Git's own credential helper/SSO exchange is included in the remote Git duration: the extension cannot attribute that internal time to authentication independently. Managed VS Code session timing likewise does not establish whether a token was refreshed internally. Nested phase and operation totals overlap and must not be added together. No speedup is claimed until a comparable workload has been measured.

## Beta 0.11.2: load saved work on demand

Opening reads repository connection metadata only: no draft enumeration, skill manifests, release archive verification or scan workers. Create and Open remain available immediately. **Load skills** enumerates drafts and verifies saved releases; **Unload skills** clears catalog and review-list state without deleting files. Changes mark a loaded list stale instead of silently scanning it again.

Explicit loading still verifies the entire library and may take time and temporarily allocate substantial memory. Unload does not promise an immediate fall in Windows working set. Package checks retain their guards. The local Performance output channel includes startup duration and shared extension-host heap/external memory and heap deltas. These are not total VS Code memory, worker peaks, or measurements attributable exclusively to this extension.

Selection waits have no processing spinner or slow-operation timer. After selection, processing starts its indicator. **Open by file path** provides the same guarded import without invoking the Windows chooser. This bypass does not establish or repair the cause of the observed native dialog hang.

Validation: 188 automated tests passed, plus an independent 50-test focused run. Native Windows chooser recovery and whole-app memory peaks still require hands-on UAT.

## Earlier 0.11.1 measurements and behavior

Beta 0.11.1 acknowledges a step click immediately, explains the action in progress, and prevents conflicting repeated clicks. Long waits get an honest waiting message; no percentage or completion time is invented. Native file pickers and GitHub account selection are named explicitly. Canceling a selection retains the draft and explains the outcome.

The editor is retained during progress updates. Mutation controls are temporarily locked for an explicit operation, while ordinary autosaving leaves typing available. A failed save keeps the editor content and stops a queued follow-up action. Earlier edits remain local and recoverable.

Local checks, package operations and release verification run in trusted installed background workers. Imported skill scripts are never executed. Archive guards, immutable release verification and explicit publication/reviewer actions remain in force. Worker timeout errors distinguish uncertain local writes; inspect saved drafts or packages before retrying an interrupted write.

## Measurements

Reproducible synthetic warm-cache Windows fixture: 189 skill files, 20 immutable releases, three samples per operation. Median milliseconds:

| Operation | Before | After |
|---|---:|---:|
| No-op Save, without an editor buffer | 5,135.77 | 0.04 |
| Check | 6,014.54 | 305.58 |
| Prepare sharing summary | 17,571.93 | 6,205.55 |

The first zero-delay host timer during summary preparation ran after 17,572.53 ms before and 3.26 ms after, demonstrating that the host can service callbacks while worker verification continues. This does not measure native paint or screen-reader latency. Verification counters in the benchmark cover the main process only; background verification is still performed.

A separate genuine edited save, including history preservation, took 24.41 ms median. No matching genuine edited-save baseline exists. These are synthetic results, not a guarantee for every user's files, disk, network or machine. `scripts/benchmark-workbench.cjs` reproduces the workload and is excluded from the installable extension.

## UAT

Use **SkillJetty: Open Workbench** and confirm the public pre-release version banner. Check immediate feedback on opening a package, checking files and preparing/saving a package. Scroll to the middle and bottom during a long operation; status should stay visible. Open **Help with this step** and **Repository & GitHub settings**, then confirm the explanations match their actions. Cancel a native picker; confirm the controls recover and your draft remains. Check keyboard focus, reduced motion and high contrast as applicable. Native assistive-technology behavior still requires hands-on verification.

For troubleshooting, use **Open performance log** under repository settings, or select **SkillJetty — Pre-release Performance** in VS Code's Output panel. This local channel records fixed operation labels, timings and outcomes. It does not transmit telemetry or record skill content, file paths, repositories or credentials. A completed handler is not a claim that a skill's AI behavior was tested.
