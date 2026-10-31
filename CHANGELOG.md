# Changelog

## 0.11.10 — 2026-10-30 (public pre-release)

- Rename the guided Check step to Sanity check and limit it to structural metadata, identity and package integrity.
- Remove detailed security detections, quality wording heuristics, direct-reference notices, mandatory evaluation filenames and per-binary warnings from guided validation and original-package verification.
- State explicitly that the sanity check does not perform security scanning; use dedicated scanners for content and execution risk review.
- Preserve archive/path/link/expansion limits, safe file handling, immutable originals, recovery and explicit upload/review behavior.

## 0.11.9 — 2026-10-30 (public pre-release)

- Keep operation status visible from the top of the workbench while scrolling, with distinct waiting, working and completion feedback.
- Put the skill task first and explain workflow actions and optional repository settings where they are used.
- Separate local Git, remote Git, managed GitHub authentication and API timings using bounded diagnostics without credentials, paths or repository names.
- Identify background jobs and their phases so snapshot and release preparation delays can be investigated.

## 0.11.8

- Match pull requests to the current upload commit when a skill/version branch is reused; preserve historical PR receipts during repair.
- Recover a mismatched numbered PR from Check PRs without another upload.
- Add an explicit Merge PR and delete branch action with exact commit verification, merge checks, confirmed merge readback and protected/default branch guards.

## 0.11.7 — 2026-10-29

- Add pre-release-only privacy-safe phase diagnostics and an always-available performance log action.
- Reuse validated import bytes for the editor, create each extraction directory once, and read only the selected editor file.
- Separate file-picker waiting time from processing time.
- Require an explicit local skills repository folder and verify local/remote identity and sync status at startup without blocking local editing.


## 0.11.6 — 2026-10-29

- Let users import a duplicate skill and publish their chosen version over the existing Git version folder. Preserve previous local drafts, packages and receipts in recovery copies and keep prior remote contents in Git history.
- Add a separate Git pull action for the registered repository before skill work. SkillJetty manages the checkout, fast-forwards it when possible and lets users open a pulled skill folder.
- Preserve ignored local files during pulls, prevent custom merge-driver/filesystem-monitor execution, and keep repeated same-version sessions recoverable.


## 0.11.5 (public pre-release)

- Show immediate action feedback, the current operation stage and elapsed time in the workbench.
- Monitor extension responses and explain when an operation may be stalled without claiming task completion or allowing duplicate submissions.
- Retain completion timing and actionable errors; distinguish waiting for a VS Code dialog from processing.
- Record action timings without skill contents, paths or credentials.

## 0.11.4 (public pre-release preparation)

- Prepare the existing `DavidFarris.skill-builder` Marketplace identity with production command, setting and view names, preserving the established listing and icon.
- Identify the public preview and version inside the workbench. Keep its work data under `.skilljetty-prerelease` with a channel-specific repository preference; do not automatically migrate stable or local-beta state.
- Confine inherited skills and export directory settings to the preview data tree, using safe defaults for absolute or escaping values.
- Preserve the original local UAT and production checkouts. Packaging, publication, native smoke checks and human UAT are distinct evidence; this preparation does not claim they passed.

## 0.11.1 (local beta / UAT)

- Acknowledge step clicks immediately with action-specific activity messages and an indeterminate indicator; explain long waits and canceled selections.
- Update progress without rebuilding the editor; preserve focus and outgoing edits, prevent duplicate actions, and stop queued submission after a failed save.
- Remove release-library verification and full-file rescans from debounced saves. Run expensive local validation, package import/preparation and library verification in trusted background workers.
- Bind sharing summaries to the exact files shown, and reject asynchronous external changes before accepting a package or uploading it.
- Add a local Performance output channel containing operation labels, duration and outcome only; no skill contents, paths or credentials.


## 0.11.0 (pre-release candidate)

- Detect a submitted skill's declared version with provenance and visible conflict warnings; manage release numbers without a required Version field.
- Show verified file changes and generate factual release notes, with optional human context and an advanced release-number override.
- Save an installable package locally without connecting GitHub; identical content reuses the preserved release, while changed work receives the next number.
- Preserve earlier text edits outside distributable skill contents and restore them without losing the content being replaced.
- Retain exact imported originals, source metadata, binary assets, immutable release packages and explicit repository publication/reviewer actions.

## 0.9.0

- Extend GitHub.com submission from branch upload to pull request creation, with recovery that reuses matching PRs instead of creating duplicates.
- Add optional collaborator reviewer selection, explicit notification consent, and separate recovery when review assignment fails.
- Add Check PRs and per-version status refresh for current and older saved uploads, distinguishing approval, merge, closure and unavailable status.
- Use VS Code-managed GitHub authentication for PR tools, with explicit account switching and API-access checks before fresh uploads.
- Keep review metadata separate from immutable skill versions. Retain branch uploads for other Git destinations; additional integrated providers are deferred.

## 0.8.0

- Present SkillJetty by DAF-TECH consistently in extension metadata, settings and authoring tools while keeping the existing extension identity and update path.
- Show Create a new skill, Open a .skill package and Open a skill folder together on Start. Create, open, edit and check locally before connecting a repository for publication.
- Use the approved DAF-TECH logo from a fixed source revision in the extension README, keeping its appearance independent of later repository changes.
- Keep portable Agent Skills as the default, with application-specific compatibility guidance and preserved supporting files. Structural checks do not execute AI models or establish behavior in every application.
- Update the archive library to adm-zip 0.6.1 with security fixes for crafted ZIP files, retaining SkillJetty's path, file and size checks.
- Preserve untouched text files byte for byte across editor navigation, including CRLF endings and leading blank lines; retain consistent CRLF endings when saving actual edits.
- Keep repository discovery results visible in the expanded connection section.

## 0.7.1

- Show Create a new skill, Open a .skill package, and Open a skill folder together with equal prominence on Start.
- Remove the duplicate dominant Create footer from the Start choice screen; retain guided next actions after a choice.

## 0.7.0

- Introduced SkillJetty by DAF-TECH: Agent Skills Studio — Build it. Version it. Ship it. The permanent Marketplace identity remains DavidFarris.skill-builder.
- Replaced the normal nested command/tree workflow with a clickable Start → Edit → Check → Publish → Done workbench and a prominent next action on every screen.
- Kept Open Workbench as the single visible Command Palette entry; clicking the activity icon opens the complete guided editor.
- Connected one repository per workspace, detecting and verifying its real default branch automatically and repairing old invalid branch associations.
- Added inline skill creation, nested text-file editing, binary asset import, autosave feedback, conflict recovery, and single-action version publication.
- Defaulted to portable Agent Skills with optional Claude, ChatGPT/Codex, Gemini CLI and Copilot compatibility guidance, preserving application-specific metadata.
- Added steady color/text progress cues, semantic forms, focus management, high-contrast styling and reduced-motion support without flashing.
- Added controller sequencing and draft-identity checks, safe supporting-file import, password-bearing URL rejection, rendered frontend tests and adversarial CSP/injection coverage.

## 0.6.0

- Organized the native workbench around active Drafts and a persistent version library, with Edit, Check and Publish as the main draft actions.
- Added Edit next version from verified local releases, preserving immutable history, nested source and original imported archive provenance.
- Remembered the workspace repository choice, suggested release versions, and removed the duplicate selection for newly prepared versions.
- Replaced internal JSON publication reports with readable previews and receipts linking source, `.skill` and changelog, explicitly distinguishing uploaded branches from merged releases.
- Added publication stages and exact-owned Git process-tree termination on timeout; cleanup failures retain the useful original error and cannot reverse a verified upload result.
- Rewrote the README and guide around one person or a team maintaining their skill library.

## 0.5.3

- Routed the existing Publish command and skill-editor publish button into the managed version/repository workflow, removing the obsolete config-file prompt from normal VS Code publishing.
- Publishing now guides repository association and release preparation when either is missing, with cancellation leaving the selected source intact.
- Added regression coverage for the existing publish entry points and config-free guided publishing.

## 0.5.2

- Fixed validation of folded YAML descriptions at the 1,024-character boundary: trailing scalar whitespace does not count toward the limit, matching Anthropic's validator. Imported and repackaged source bytes remain unchanged.

## 0.5.1

- Added Create a GitHub repository alongside existing-repository selection, with explicit visibility, Private-first selection, confirmation and initialized base-branch verification.
- Published repository layout now places each skill at the repository root as `<skill-name>/<version>/`, containing its package, exploded source and changelog.
- Added repository-creation cancellation, failure and association regression tests.

## 0.5.0

- Added a native Skill Workbench for importing complete `.skill` archives, recursive file editing and managed skill creation.
- Preserved original packages and nested/binary contents, with guarded extraction, archive limits and integrity checks.
- Added immutable semantic-version release bundles containing rebuilt `.skill`, exploded source, per-version changelog and file hashes.
- Added persistent repository association, destination-repository publication previews and isolated release-branch pushes.
- Added recoverable completion archival after verified publication, with retention of edits newer than the published snapshot.
- Added a local manual playground with prompts, expected results and recorded observations; it does not call a model automatically.
- Fixed metadata editing for multiline YAML descriptions and unknown nested frontmatter.
- Added automated archive, versioning, Unicode and repository-isolation regression coverage.

## 0.4.1

- Removed redundant explicit command and view activation events now inferred by VS Code 1.74 and newer.
- Retained workspace skill discovery through `workspaceContains:skills/*/SKILL.md`.

## 0.4.0

- Upgraded ZIP and YAML dependencies to remediate known denial-of-service vulnerabilities.
- Added a deterministic Trust Scan for credentials, network access, process execution, destructive operations, broad tool grants, and oversized files.
- Added quality-aware validation for trigger descriptions, name/folder mismatches, unsupported frontmatter, unfinished scaffolds, missing evals, and unreferenced supporting files.
- Added Evaluation Preflight with persisted JSON results under `workbench/<skill>/runs/` and an in-editor results report.
- Added packaging warnings for blocking trust or structural findings.
- Extracted reusable trust, quality, and evaluation logic from the VS Code extension into `src/skill-analysis.ts`.
- Added automated tests for analysis, trust findings, eval parsing, trigger separation, and honest evaluation labeling.

## 0.3.5

- Moved Git publish confirmation into the VS Code command flow and passed `--yes` to the terminal publisher to avoid terminal automation interrupting the interactive prompt.

## 0.3.4

- Added a publish-time repository picker so `Skill Builder: Publish Skill to Git` can target a detected Git remote, GitHub URL, or local repository path instead of only the configured default.
- Allowed direct repository URLs and paths in the publish script's remote override.

## 0.3.3

- Renamed the Marketplace display name to Claude Skills Toolkit.
- Added Marketplace icon and README screenshot assets.
- Reworked package metadata, keywords, categories, homepage, and issue links for the public Marketplace listing.
- Rewrote the README as a product-focused install and usage guide.
- Updated the public GitHub repository description, homepage, and topics.

## 0.3.2

- Fixed Git publishing skill selection so the command can publish a selected `SKILL.md`, an Anthropic `.skill` package file, or an extracted skill folder instead of reconstructing only `skills/<name>/SKILL.md`.
- Split publish browsing into file and folder pickers so Windows shows a clear `SKILL.md`/`.skill` file picker or an extracted-folder picker.
- Added workspace-copy handling for external publish selections, copying `.skill` package files into `dist/` and extracted skill folders into `skills/` before staging.

## 0.3.1

- Changed Git publish validation to be opt-in by default so publishing does not depend on a globally installed validator.
- Bundled pinned `skills-ref@0.1.5` validation so users do not need a global `skills-ref` install.
- Added a structured `git.validationCommand` config option for overriding the validation command without shell string parsing, with a pinned `npx` fallback for incomplete source installs.

## 0.3.0

- Added config-aware Git import/update for individual skill folders.
- Added `Skill Builder: Import/Update Skill from Git` and the `npm run import-skill -- <skill-name>` CLI path.
- Documented the pull/edit/publish workflow and clarified that remote merges still happen through normal GitHub review or PR handling.

## 0.2.3

- Added manual, config-driven git publishing for individual skill folders.
- Added `Skill Builder: Publish Skill to Git` and the `npm run publish-skill -- <skill-name>` CLI path.
- Added an inert `skill-builder.config.example.json` so users must opt in before any publish can push.

## 0.2.2

- Added a browse fallback to skill selection commands so users can open any existing `SKILL.md` or skill folder outside the configured workspace `skills/` directory.
- Added explicit command activation events for all contributed Skill Builder commands.

## 0.2.1

- Prevented blank trigger descriptions from being saved through the Skill Editor metadata tab.

## 0.2.0

- Added supporting-file pickers inside the Interactive Builder for references, scripts, and assets.
- Added Workflow Modules intake that creates ordered `references/01-*.md` files.
- Generated `SKILL.md` now includes ordered module callouts for progressive disclosure.
- Added `Skill Builder: Health Check` for local structure, reference, eval, script, and secret-like-value checks.
- Added `Skill Builder: Open Skill Editor` with tabs for metadata, modules, files, evals, and package actions.

## 0.1.2

- Added `Skill Builder: Add Supporting Files`.
- Existing files can now be copied into a skill's `references/`, `scripts/`, or `assets/` folder from the VS Code file picker.
- Added README guidance for when to use references, scripts, and assets.

## 0.1.1

- Added interactive creation of starter reference files under `references/`.
- Added interactive creation of non-interactive Python/JavaScript script stubs under `scripts/`.
- Added asset placeholder notes under `assets/README.md`.
- Generated `SKILL.md`, workbench brief, and creation plan now record planned supporting files.

## 0.1.0

- Expanded the interactive builder into a deeper skill-authoring intake.
- Added workflow steps, edge cases, quality checks, supporting-file plans, script plans, eval prompts, target notes, and security notes.
- Added `workbench/<skill-name>/creation-plan.md` generation with an Anthropic-aligned authoring checklist.
- Generated `SKILL.md` and `evals/evals.json` now use more of the interactive intake directly.

## 0.0.9

- Added MIT licensing metadata and packaged license file.
- Added a README license section.

## 0.0.8

- Rewrote the Marketplace README around installed-extension usage.
- Clarified the interactive builder, packaging, Claude Code sync, validation, and settings workflows.
- Added Marketplace keywords and a clearer short description.

## 0.0.7

- Added the interactive skill intake builder.
- Added Claude Code sync support.
- Added free-form authoring prompt generation.
- Added target-surface-aware starter skill generation.
## 0.11.2 (local beta UAT)

- Open the workbench without enumerating drafts, verifying release archives or migrating repository associations. Load skills explicitly; unload clears the displayed catalog. Other actions do not silently rescan it.
- Separate waiting for a file selection from processing feedback. Add Open by file path as an alternative to the hanging native Windows chooser.
- Record startup/action duration and shared extension-host heap/external memory in the local Performance output channel. No skill content or paths are logged.

## 0.11.3 (local beta UAT)

- Initialize connection metadata before the first workbench page; remove startup progress messages that could arrive after rendering and leave a stale Opening spinner.
- Place Load skills before the create/open choices and show the running beta version in the header.

## 0.11.4 (local beta UAT)

- Give secondary buttons and form controls visible theme-aware boundaries, including transparent button themes; disabled controls retain a distinct dashed boundary.
- Follow the selected VS Code theme for native control color scheme and high-contrast primary actions.
- Preserve selected-file metadata and error-message text contrast; keep warning/error meaning in words alongside color.
- Review the rendered workflow across light, dark, high-contrast dark/light and forced-colors variants, including narrow layouts.

