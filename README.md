# SkillJetty — Agent Skills Studio

[User guides, channel status and release notes](https://github.com/Mr-GraphnStaff/Skill-builder/wiki)

Install the stable release of **SkillJetty by DAF-TECH** for the established workbench, or choose **Install Pre-Release Version** in VS Code to try the public preview. Both channels use the same Marketplace listing and **SkillJetty: Open Workbench** command; they are alternate versions in the selected VS Code profile. The separate local UAT extension remains a distinct installation.

The preview can make a portable skill package, a Claude plugin containing one or more skills, or both. Save locally first; GitHub sharing is optional. It also supports Gemini App ZIP exports with compatibility reports. Existing work stays in place. Consult the [Release Channels wiki](https://github.com/Mr-GraphnStaff/Skill-builder/wiki/Release-Channels) for the verified public version and channel status. Production remains unchanged.

<img src="https://raw.githubusercontent.com/Mr-GraphnStaff/Skill-builder/02f32bb5282b87ef81ba4929c11dd88094403741/images/icon.png" alt="DAF-TECH" width="96" />

**Agent Skills Studio — Build it. Improve it. Share it.**

Create, edit, check and publish Agent Skills from one guided VS Code workbench.

Focus on what your skill should do. SkillJetty reads its declared identity, manages release numbers and prepares factual file-change notes. Save an installable package locally without a repository, or connect one when you want to share for review.

The preview acknowledges clicks with an activity indicator and explains what is happening. Expensive local checks run in the background; routine saves no longer reopen every saved release. See [performance measurements and feedback behavior](docs/performance-and-feedback.md).

## Open the workbench

Click the **SkillJetty** icon on VS Code's left activity bar, or run **SkillJetty: Open Workbench** from the Command Palette. The header reports the running installed build. Check **Extensions** for the installed version and the linked wiki for public channel status. Switching channels changes the installed version in that profile; it does not migrate your work data.

An explicitly configured, previously connected Skills repository continues with its existing connection and private `.skilljetty-prerelease` data folder. It does not need conversion to a managed workbench. **Manage work location (optional)** offers a separate managed setup when you want one. A local repository setting must identify the Git root containing `.git`; the GitHub setting must identify the repository, not an individual skill's `tree/` or `blob/` page.

Unrelated ignored private files can remain in the local repository. Pull preserves them and stops if incoming files would collide with them; tracked edits and nonignored untracked files still require attention before pulling. No cleanup or deletion of private files is automatic.

## Choose what to make

**Create a skill** makes one set of instructions and supporting files. Create a
new draft or open an existing skill, edit it, run the structural check, then save
the `.skill` package on this computer.

**Build a plugin** bundles skills for Claude:

1. Choose **Build a plugin** on Start.
2. Open a `.skill` file, open a skill folder, or choose a saved skill to include.
3. Review its content and run the structural check.
4. Review the plugin name, description and included skills, then save the plugin
   ZIP on this computer. Optional publisher details can stay closed.

A skill is the content; a plugin is the bundle containing that content. The
plugin ZIP is created when you save it. Installing it into Claude is a separate
action. Neither local route needs a Git repository or GitHub sign-in.

## Create or open your workbench

Choose **Create workbench** and select its parent folder. Review the exact `.skilljetty-prerelease` destination and folder descriptions, then confirm. Setup accepts a new or empty folder and creates a readable `README.md`. It does not clone, pull, upload or move existing files. **Open existing workbench** accepts a previously initialized workbench; an ordinary opened project is never adopted automatically.

[The complete folder guide](docs/workbench-folders.md) explains what belongs in every folder and how local and remote repositories connect. You can create and save a skill package without GitHub. Importing an outside folder or package makes a copy inside the workbench; the original remains unchanged.

Open the gear for **Extension Settings** when ready to share. Set **Prerelease: Repository URL** to a GitHub HTTPS address, with no embedded credentials. The default local copy is `repositories/skills` inside the workbench. An optional custom local path must remain inside `repositories/`. An explicit blank disables local reuse; an unset value uses the default or the saved association. Outside repository folders, linked paths, SSH and local-file remotes are unavailable in this candidate.

Saving settings does not clone, pull or upload. Run **SkillJetty: Pull Skills Repository** to create or update the local copy deliberately; **Verify Skills Repository** checks the local/remote identity and detected default branch. Use **Connect GitHub Account** for VS Code sign-in. Configuration displays the workbench, local repository, remote and target branch separately. Review the destination and changed files again before uploading. Git commits prepared by this candidate identify the SkillJetty bot explicitly.

SkillJetty never writes settings automatically into the currently opened project. Save and close the current workbench panel before switching workbenches. Existing folders stay in place. The older external-folder installation commands are unavailable in this pre-release. VS Code still manages its own settings, credentials and session data; this is an application write boundary, not an OS sandbox.

## What is saved in the repository?

```text
Skills/
  meeting-notes/
    1.0.0/
      source/meeting-notes/
        SKILL.md
        references/...
        assets/...
        scripts/...
        evals/...
        agents/...
      meeting-notes-1.0.0.skill
      CHANGELOG.md
      release.json
      original.skill           # only for an originally imported package
```

Only existing supporting folders are included. Complex nested files and binary assets are preserved. First versions need changelogs too. Prefer a new version for changes; explicitly choosing an existing number replaces that version while retaining recovery copies and Git history.

For GitHub.com, submission uploads a **review branch** and creates a **pull request**, reusing an existing matching PR when retried. Review and merge follow your repository's rules. Approval alone does not put the skill on the default branch; the workbench never merges automatically. It does not upload the skill into an AI application or publish this extension to the Marketplace.

Choose **Merge PR and delete branch** when the submission is ready. SkillJetty verifies the exact uploaded commit and GitHub merge rules, confirms the merge, then deletes only that unchanged submission branch using a Git SHA lease. If cleanup cannot finish, the verified merge remains recorded and the branch is retained for retry.

Use **Check PRs** from Start to refresh saved submissions, including uploads made with older SkillJetty versions. If an older upload has no PR, choose **Create PR**. Refreshing status never creates a PR or requests a reviewer. Status shows awaiting review, changes requested, approved, merged, or closed without merge. If GitHub cannot be reached, the workbench shows the error and last verified status rather than guessing.

This review flow supports **GitHub.com**. Other Git destinations retain branch uploads; their review process must be completed in the hosting service. Additional repository services are a future discussion.

## Portable skills and application guidance

The default is the [open Agent Skills format](https://agentskills.io/specification): `SKILL.md` plus optional supporting files. Application-specific files such as `agents/openai.yaml` are preserved. The guided sanity check verifies structure; it does not verify application compatibility, resolve every link, run a model or perform security scanning. Your selected application is context for your work. Dedicated scanners should inspect the complete package, including preserved originals, before sharing or execution.

## Your work stays recoverable

- Failed checks, canceled file pickers and failed uploads retain your draft.
- A completed submission removes an unchanged draft from active work and archives it recoverably. A partial submission retains recovery actions; retrying PR creation does not upload the version again.
- Newer unpublished changes remain active.
- Resume saved drafts or choose a library version to edit its next version.
- If another editor changes a file, conflicting workbench edits are saved in local recovery records rather than overwriting the newer file.
- The UI uses text and icons alongside color. There are no flashing prompts; reduced-motion and high-contrast preferences are respected.

See [the short workflow and recovery guide](docs/workbench-guide.md).

## Requirements and development

VS Code 1.90+. Publishing requires Git, a configured commit identity, and repository access. GitHub.com PR creation, reviewer selection and status checks use **VS Code's GitHub sign-in**. Git push access and API access are separate: SkillJetty checks API access before a fresh GitHub submission. Use **SkillJetty: Connect GitHub Account** if the signed-in account cannot access the destination. Your repository or organization may require additional authorization.

Creating a new repository still uses your signed-in **GitHub CLI** account. Entering an existing repository address does not require discovery. PR tools do not require the CLI. No model credentials, paid service, or global validator installation is required. SkillJetty does not store your GitHub token in project files.

```sh
npm install
npm test
npm run package
```

Older authoring commands remain internal for compatibility. The guided workbench is the normal entry point. Local preview builds may be newer than the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=DavidFarris.skill-builder).

MIT License. See [LICENSE](LICENSE).
