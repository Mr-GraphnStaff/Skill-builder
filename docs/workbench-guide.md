# Create, edit and publish a skill

Open **SkillJetty** using its left sidebar icon or the single **SkillJetty: Open Workbench** command. Stay in the workbench and follow the highlighted Next step button.

The status at the top stays visible while you scroll. It distinguishes processing from a VS Code file picker or account selection waiting for you. Open **Help with this step** for the current actions. **Configuration** shows your workbench folder, local repository, remote sharing destination and target branch. Its gear opens SkillJetty’s VS Code Extension Settings. Local drafting does not require a repository connection.

## Set up your workbench

Choose **Create workbench** for a new dedicated home, or **Open existing workbench** for one already set up by SkillJetty. Creation lets you choose a parent folder and review the exact `.skilljetty-prerelease` destination before writing. Setup creates local folders and a readable `README.md`; it does not move old work, clone repositories or upload skills. Canceling setup keeps your current selection.

The workbench is SkillJetty’s local write boundary. Your open VS Code project does not silently become that boundary. Drafts, saved versions, local Git repositories, temporary work and recovery records stay inside it. Files elsewhere can be imported as read-only sources; SkillJetty edits the copy inside the workbench. AI-tool folders outside it cannot be used as write destinations.

Open **What goes in each workbench folder?** in Configuration whenever you need the folder map. See [Workbench folders](workbench-folders.md) for the complete guide.

## Start

After setting up your workbench, you can create, open, edit and check skills locally before connecting a repository. When ready to share, use the Configuration gear to set a GitHub HTTPS repository URL, for example `https://github.com/your-org/skills.git`, and use VS Code GitHub sign-in. SSH addresses, local paths and file URLs are unavailable as remote destinations in this preview. The local Git copy belongs under the workbench’s `repositories/` folder; its default location is `repositories/skills/`. Verify the exact local folder and remote address before using the Command Palette’s **SkillJetty: Verify Skills Repository** or **SkillJetty: Pull Skills Repository**. Saving settings does not clone, pull or upload anything.

The workbench detects the repository's existing default branch when you verify or share. You do not enter a branch name. Configuration distinguishes that target branch from the temporary submission branch created for a version upload. Old work folders and external local repositories are not adopted or moved automatically. Import a skill/package to copy its contents into a new workbench, and explicitly connect the remote you intend to use.

Choose **Create a new skill**, **Open a .skill file**, **Open a skill folder**, or a saved draft's **Resume** button. A `.skill` file is a packaged skill; a skill folder must contain SKILL.md. A library version can be restored for next-version editing without changing the released snapshot.

## Edit

A new skill needs a lowercase hyphenated name, a description of what it does and when to use it, and useful instructions. Generated YAML wraps your instructions; there is no automatic AI authoring or model run.

The file list shows every supported nested file. Select text files to edit them in the workbench. Binary assets remain intact. Add or copy a supporting file using the labeled path field; existing files are not silently replaced. Reference supporting material from the instructions where appropriate.

Edits save locally after a short pause and before moving to the next step. The save indicator reports success or an error. If a file changed in another editor, the newer disk copy is retained and your conflicting buffer is preserved in the workbench’s recovery area. Use **Reload saved file** after preserving/reviewing that recovery copy. No conflicting edit is silently substituted for another skill's file.

Select an intended application if helpful. Portable is the default. This is context for your work; the sanity check does not verify compatibility, install the skill or run it.

Choose **Sanity check**.

## Sanity check

The sanity check verifies readable YAML metadata, required name and description, matching skill identity and package structure. Structural errors link back to the relevant file where possible. Fix those items and run the sanity check again before continuing to Submit. Fonts, binary assets, indirectly referenced supporting files and alternative evaluation filenames do not create content-review warnings.

**Structural checks passed. Security scanning was not performed by SkillJetty.** This is a local packaging check, not security approval, vendor compatibility verification or a model test. It does not traverse every reference or verify runtime-generated paths. Use your organization's dedicated scanners and intended runtime checks before sharing or executing the skill; no external scanner is automatically connected or invoked.

External review should cover the complete artifact, including supporting assets and preserved `original.skill` archives. Editing a copy does not remove content from its immutable original. SkillJetty continues to enforce safe import and archive handling, identity, size and decompression limits, and repository URL protections; these guards remain active independently of content scanning.

## Submit

Review the managed version, file changes and generated release notes, including for `1.0.0`. You can add optional context. **Save package on this computer** prepares a local package without a repository. Connect a repository when you want to upload for review. Advanced options let you choose a release number explicitly. You can reuse an identical prepared release or explicitly replace the same version; previous local contents are preserved in recovery copies and earlier uploaded contents remain in Git history. Review the changes carefully before reusing a version that others may already have consumed.

For GitHub.com, use the Command Palette’s **SkillJetty: Connect GitHub Account** if you need to select the account used for PRs. VS Code handles sign-in and permission consent. This account must have access to the destination; existing Git push access alone does not prove API access. Repository creation uses the explicit **SkillJetty: Create GitHub Repository** command and GitHub CLI sign-in, which can be a different account. You can enter an existing repository URL in Settings instead.

Optionally load available reviewers and choose a person, or skip review assignment. The list uses eligible collaborators, excludes yourself and bots, and does not automatically assign past contributors. Submitting with a selected reviewer requests their review and sends a GitHub notification. If collaborator listing is unavailable, you can still create the PR and arrange review on GitHub.

**Upload & create PR** is the explicit submission action. SkillJetty checks GitHub API access before a fresh upload, checks the repository's current default branch, validates the source, packages and reopens the archive, verifies its bytes, and prepares an isolated destination checkout. It uploads only the version folder, verifies the remote commit, then creates or finds the matching PR. It never merges automatically.

The repository receives `<skill>/<version>/source/<skill>/**`, the versioned `.skill`, `CHANGELOG.md` and `release.json`. An originally imported package is retained as `original.skill`. Scratch-created skills do not invent an original archive. Empty directories survive in the archive and manifest, although Git cannot represent them in the exploded tree.

## Done

The completion screen links to the PR, source, package and changelog. Use **Check status** for the latest review state. Uploaded means available on the recorded branch; approved means a review approved it. Only a verified merge means it reached the target branch. Repository checks and review rules still apply.

After successful submission and persisted recovery evidence, an unchanged draft leaves active work and is archived recoverably. Later local changes remain active and the completion screen explains that outcome. If PR creation or reviewer assignment fails after upload, follow the explicit recovery action; the upload receipt is retained. Start another skill without deleting your history.

## Check PRs

From Start, choose **Check PRs** to refresh saved uploads. Each entry shows the skill/version, review status and last check time, with **Open PR** and recovery actions when available. This checks submissions recorded in your local workspace; it is not a list of every PR in the repository.

Older uploads can show **Uploaded — no PR**. Choose **Create PR** for that version. A status refresh itself is read-only: it does not create PRs or request reviews. Existing matching PRs are reused. Closed PRs remain closed; they are not silently reopened.

**Awaiting review**, **Changes requested**, **Approved**, **Merged** and **Closed without merge** describe different outcomes. A connection failure is shown with the last verified result and timestamp; it does not mean the PR disappeared. Review details can always be inspected on GitHub.

The managed workbench’s sharing and integrated review flow currently supports GitHub.com over HTTPS. Other providers, SSH destinations and local-file remotes are unavailable in this preview.

## Recovery

| What happened | Next action |
|---|---|
| File picker canceled | Continue editing; no upload happened. |
| Structural check failed | Use the indicated file/fix action, then check again. |
| Repository could not be accessed | Reconnect from the workbench after checking your normal Git access. |
| GitHub sign-in canceled or API access denied | Use Connect GitHub account or Switch GitHub account and select an authorized account. A fresh submission stops before uploading. |
| Upload succeeded but PR creation failed | Use the PR recovery action. SkillJetty rechecks for a matching PR before creating one; the version does not need another upload. |
| PR exists but reviewer request failed | Open the PR or retry the explicit review request. The uploaded version and PR remain intact. |
| Status could not refresh | Check connectivity/account access, then check again. The last verified result remains visible. |
| Old saved branch is invalid | Reconnect; the workbench detects the default branch automatically. |
| Git timed out | Keep the draft and receipt. Check the remote result before retrying an upload or merge; a timeout does not prove the remote write failed. |
| Version is already prepared with different contents or notes | Choose a new version, or review an explicit same-version replacement. Earlier local contents are preserved in recovery copies. |
| Upload succeeded but local completion failed | Use the receipt. Retrying the same recorded version rechecks the remote commit before attempting only local completion. |
| Another editor changed the file | Both versions are preserved; inspect the recovery record, then reload the saved file. |
| Historical version is corrupt | Drafts remain available. Recover that version from a known good copy before restoring it. |

Keep the complete workbench together, including `skills/`, `repositories/`, `releases/`, `recovery/` and `.skill-workbench/`. The shared repository contains version bundles; each teammate uses their own workbench and Git identity. PR metadata is stored separately from immutable release contents. The workbench does not run AI models or replace repository merge rules.

### Merge a submitted skill

Choose **Merge PR and delete branch** on the recorded submission when it is ready. The action verifies the PR repository, target, branch, commit and checks before requesting a merge. Only a confirmed merge permits cleanup; a Git SHA lease prevents cleanup from deleting a newer upload on the same branch. A cleanup failure is reported separately and can be retried without uploading or merging again.

If an older submission is shown for a reused version branch, use **Create PR for this upload** or **Find current PR for this upload**. Historical receipts are preserved while the current submission is verified.
# Exporting Claude plugins and Gemini ZIPs (pre-release 0.15.0)

At Submit, Portable skill remains the default. Choose Claude plugin to package
one or more skills under `skills/<name>/` with `.claude-plugin/plugin.json`, or
Both to prepare portable packages and a plugin bundle. The bundle has its own
name, description, author/license choices and version. Open/import repository
skills or restore saved skill versions as drafts before selecting them as bundle
members. Source files are copied unchanged; scripts are never run during export.

Save locally works without GitHub. Repository submission creates separate review
branches/PRs for the selected portable releases and plugin. Done shows individual
outcomes and PR links. A partial submission retains prepared packages, drafts and
verified upload receipts; use Check PRs before retrying. Review and merge each PR
explicitly. Plugin releases live in `plugin-releases/`; their GitHub destination
is `Plugins/<bundle>/`, with the installable plugin at `Plugins/<bundle>/source`.
Only the current bundle occupies that active folder; Git history and local
saved releases retain older versions. Portable destinations are unchanged.

Optionally request Gemini App ZIPs. SkillJetty checks documented file types and
size limits and blocks unsupported content without deleting it. ZIPs and reports
live in `gemini-releases/`. These exports require manual Google import and have
not been tested in your account. Gemini App, Workspace Studio, Cloud Enterprise
and CLI have separate capabilities. Network-dependent scripts are not supported
by the documented Gemini App execution environment.

A plugin package is not a connected organization marketplace. The generated
marketplace handoff must be added manually to your catalog; organization syncing,
installation preferences and group assignment remain your administrator's work.

Public Claude directory submissions have additional checks. The local report
identifies exact oversized paths, missing README/license details, opaque binary
content and other known directory findings. Private exports preserve databases
and other supporting content even when that report identifies a public-directory
blocker. No database is deleted, converted, downloaded or moved to a service.
Optional listing fields include a bundled icon path and HTTPS privacy,
documentation and support URLs. Portal validation and security/policy review
remain required; local readiness is not directory acceptance.

For a plugin export, point the portal at `Plugins/<name>/source`,
which contains `.claude-plugin/plugin.json`, rather than a skill's release-history
folder or its `.skill` archive. Higher bundle versions update this stable folder
through a review branch/PR. The publisher verifies that an existing active folder
is a valid release of the same plugin before replacement. An older version-folder
layout or unrecorded/modified content requires a separately reviewed migration.

On Start, use **Review older saved releases** to see a local archive inventory.
The newest saved release, editable drafts and pending/unverified uploads are
protected. Confirming the reviewed inventory moves eligible older releases into
workbench recovery with a before/after hash receipt. Restore checks integrity and
refuses to overwrite existing files. This local archive does not delete GitHub
folders or rewrite Git history; legacy repository cleanup is a separate reviewed
migration. Keep the whole workbench, including recovery, in your backup.
