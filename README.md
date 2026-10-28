# SkillJetty Beta — local UAT

**This is the separate local Beta extension (`DavidFarris.skill-builder-beta`).** Open **SkillJetty Beta: Open Workbench**. It runs alongside production SkillJetty with separate commands, settings and `.skilljetty-beta` drafts/history. Test only this clearly named Beta extension. Production remains on its approved baseline. Marketplace pre-release publication is a separate step after UAT approval.

<img src="https://raw.githubusercontent.com/Mr-GraphnStaff/Skill-builder/02f32bb5282b87ef81ba4929c11dd88094403741/images/icon.png" alt="DAF-TECH" width="96" />

**Agent Skills Studio — Build it. Improve it. Share it.**

Create, edit, check and publish Agent Skills from one guided VS Code workbench.

Focus on what your skill should do. SkillJetty reads its declared identity, manages release numbers and prepares factual file-change notes. Save an installable package locally without a repository, or connect one when you want to share for review.

The beta acknowledges clicks with an activity indicator and explains what is happening. Expensive local checks run in the background; routine saves no longer reopen every saved release. See [performance measurements and feedback behavior](docs/performance-and-feedback.md).

## Open the workbench

For UAT, click the **SkillJetty Beta** icon on VS Code's left activity bar, or run **SkillJetty Beta: Open Workbench** from the Command Palette. Confirm the Beta / UAT banner. The separately installed **SkillJetty** extension and **SkillJetty: Open Workbench** command are production; leave them unchanged during beta testing.

Choose how to start, then follow the highlighted **Next step** action:

1. **Start:** choose **Create a new skill**, **Open a .skill file**, or **Open a skill folder**. You can also resume saved work. A repository connection is needed only when you are ready to publish.
2. **Edit:** write the skill's instructions and edit its supporting files in the workbench. Add text files or copy existing assets. Changes save locally.
3. **Check:** see problems with links to the files that need attention. Fix them, then check again. Checking does not upload anything, and a passed structural check does not establish model behavior.
4. **Submit:** review the detected file changes and managed release number. Add optional context, then save a package on this computer. To share through GitHub, connect a repository and choose **Upload & create PR**. You can optionally choose a reviewer; requesting review notifies that person. A manual release-number override is available under Advanced.
5. **Done:** open the pull request or the source, `.skill` and changelog links. Use **Check status** to refresh review progress. Choose **Work on another skill** when finished.

No terminal commands or Git branch names are needed for normal use. The extension detects the repository's actual default branch. Git credentials and repository access still need to work on your machine.

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

Only existing supporting folders are included. Complex nested files and binary assets are preserved. First versions need changelogs too. Past versions are immutable; publish a new version for changes.

For GitHub.com, submission uploads a **review branch** and creates a **pull request**, reusing an existing matching PR when retried. Review and merge follow your repository's rules. Approval alone does not put the skill on the default branch; the workbench never merges automatically. It does not upload the skill into an AI application or publish this extension to the Marketplace.

Use **Check PRs** from Start to refresh saved submissions, including uploads made with older SkillJetty versions. If an older upload has no PR, choose **Create PR**. Refreshing status never creates a PR or requests a reviewer. Status shows awaiting review, changes requested, approved, merged, or closed without merge. If GitHub cannot be reached, the workbench shows the error and last verified status rather than guessing.

This review flow supports **GitHub.com**. Other Git destinations retain branch uploads; their review process must be completed in the hosting service. Additional repository services are a future discussion.

## Portable skills and application checks

The default is the [open Agent Skills format](https://agentskills.io/specification): `SKILL.md` plus optional supporting files. You can select Portable, Claude, ChatGPT/Codex, Gemini CLI or GitHub Copilot for compatibility guidance. Application-specific files such as `agents/openai.yaml` are preserved. Compatibility checks do not promise identical behavior across applications, install the skill, or run a model.

## Your work stays recoverable

- Failed checks, canceled file pickers and failed uploads retain your draft.
- A completed submission removes an unchanged draft from active work and archives it recoverably. A partial submission retains recovery actions; retrying PR creation does not upload the version again.
- Newer unpublished changes remain active.
- Resume saved drafts or choose a library version to edit its next version.
- If another editor changes a file, conflicting workbench edits are saved in local recovery records rather than overwriting the newer file.
- The UI uses text and icons alongside color. There are no flashing prompts; reduced-motion and high-contrast preferences are respected.

See [the short workflow and recovery guide](docs/workbench-guide.md).

## Requirements and development

VS Code 1.90+. Publishing requires Git, a configured commit identity, and repository access. GitHub.com PR creation, reviewer selection and status checks use **VS Code's GitHub sign-in**. Git push access and API access are separate: SkillJetty checks API access before a fresh GitHub submission. Use **Connect GitHub account** or **Switch GitHub account** if the signed-in account cannot access the destination. Your repository or organization may require additional authorization.

Repository discovery and creation still use your signed-in **GitHub CLI** account; entering an existing repository URL does not require that discovery step. The new PR tools do not require the CLI. No model credentials, paid service, or global validator installation is required. SkillJetty does not store your GitHub token in project files.

```sh
npm install
npm test
npm run package
```

Older authoring commands remain internal for compatibility. The guided workbench is the normal entry point. Local preview builds may be newer than the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=DavidFarris.skill-builder).

MIT License. See [LICENSE](LICENSE).
