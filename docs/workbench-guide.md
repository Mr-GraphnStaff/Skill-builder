# Create, edit and publish a skill

Open **SkillJetty** using its left sidebar icon or the single **SkillJetty: Open Workbench** command. Stay in the workbench and follow the highlighted Next step button.

The status at the top stays visible while you scroll. It distinguishes processing from a VS Code file picker or account selection waiting for you. Open **Help with this step** for the current actions. **Repository & GitHub settings** groups optional sharing setup and shows the latest connection state even while collapsed. Local drafting does not require a repository connection.

## Start

Open a local folder for your drafts and version history. You can create, open, edit and check skills locally before connecting a repository. Connect the publication destination when you are ready to publish: use **Find my repositories**, enter a repository URL, or create a new repository using the inline form. Creation requires an explicit name and visibility choice; private is the default. No skill is uploaded during connection.

The workbench detects the repository's existing default branch automatically. You do not enter a branch name. A single unambiguous repository from old local records can be migrated; conflicting old destinations require choosing one connection.

Choose **Create a new skill**, **Open a .skill file**, **Open a skill folder**, or a saved draft's **Resume** button. A `.skill` file is a packaged skill; a skill folder must contain SKILL.md. A library version can be restored for next-version editing without changing the released snapshot.

## Edit

A new skill needs a lowercase hyphenated name, a description of what it does and when to use it, and useful instructions. Generated YAML wraps your instructions; there is no automatic AI authoring or model run.

The file list shows every supported nested file. Select text files to edit them in the workbench. Binary assets remain intact. Add or copy a supporting file using the labeled path field; existing files are not silently replaced. Reference supporting material from the instructions where appropriate.

Edits save locally after a short pause and before moving to the next step. The save indicator reports success or an error. If a file changed in another editor, the newer disk copy is retained and your conflicting buffer is saved under `.skill-workbench/recovery/`. Use **Reload saved file** after preserving/reviewing that recovery copy. No conflicting edit is silently substituted for another skill's file.

Select an intended application if helpful. Portable is the default. This is context for your work; the sanity check does not verify compatibility, install the skill or run it.

Choose **Sanity check**.

## Sanity check

The sanity check verifies readable YAML metadata, required name and description, matching skill identity and package structure. Structural errors link back to the relevant file where possible. Fix those items and run the sanity check again before continuing to Submit. Fonts, binary assets, indirectly referenced supporting files and alternative evaluation filenames do not create content-review warnings.

**Structural checks passed. Security scanning was not performed by SkillJetty.** This is a local packaging check, not security approval, vendor compatibility verification or a model test. It does not traverse every reference or verify runtime-generated paths. Use your organization's dedicated scanners and intended runtime checks before sharing or executing the skill; no external scanner is automatically connected or invoked.

External review should cover the complete artifact, including supporting assets and preserved `original.skill` archives. Editing a copy does not remove content from its immutable original. SkillJetty continues to enforce safe import and archive handling, identity, size and decompression limits, and repository URL protections; these guards remain active independently of content scanning.

## Submit

Review the managed version, file changes and generated release notes, including for `1.0.0`. You can add optional context. **Save package on this computer** prepares a local package without a repository. Connect a repository when you want to upload for review. Advanced options let you choose a release number explicitly. You can reuse an identical prepared release or explicitly replace the same version; previous local contents are preserved in recovery copies and earlier uploaded contents remain in Git history. Review the changes carefully before reusing a version that others may already have consumed.

For GitHub.com, choose **Connect GitHub account** (or **Switch GitHub account** after selecting one) if you need to select the account used for PRs. VS Code handles sign-in and permission consent. This account must have access to the destination; existing Git push access alone does not prove API access. Repository discovery and creation still use GitHub CLI sign-in, which can be a different account. You can enter an existing repository URL instead of using discovery.

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

The integrated review flow currently supports GitHub.com. Other Git destinations receive a branch upload and must use their own review tools. Additional providers are deferred.

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

Keep `skills/`, `releases/`, `workbench/` and `.skill-workbench/` with the local workspace. The shared repository contains version bundles; each teammate uses their own workspace and Git identity. PR metadata is stored separately from immutable release contents. The workbench does not run AI models or replace repository merge rules.

### Merge a submitted skill

Choose **Merge PR and delete branch** on the recorded submission when it is ready. The action verifies the PR repository, target, branch, commit and checks before requesting a merge. Only a confirmed merge permits cleanup; a Git SHA lease prevents cleanup from deleting a newer upload on the same branch. A cleanup failure is reported separately and can be retried without uploading or merging again.

If an older submission is shown for a reused version branch, use **Create PR for this upload** or **Find current PR for this upload**. Historical receipts are preserved while the current submission is verified.
