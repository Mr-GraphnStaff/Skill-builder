# SkillJetty by DAF-TECH

<img src="https://raw.githubusercontent.com/Mr-GraphnStaff/Skill-builder/02f32bb5282b87ef81ba4929c11dd88094403741/images/icon.png" alt="DAF-TECH" width="96" />

**Agent Skills Studio — Build it. Version it. Ship it.**

Create, edit, check and publish Agent Skills from one guided VS Code workbench.

**One connected repository. One folder per skill. Source, a valid `.skill` package and a changelog for every version.**

## Open the workbench

Click the **SkillJetty** icon on VS Code's left activity bar. It opens the guided workbench directly. You can also run **SkillJetty: Open Workbench** from the Command Palette; that is the only normal public command you need.

Choose how to start, then follow the highlighted **Next step** action:

1. **Start:** choose **Create a new skill**, **Open a .skill file**, or **Open a skill folder**. You can also resume saved work. A repository connection is needed only when you are ready to publish.
2. **Edit:** write the skill's instructions and edit its supporting files in the workbench. Add text files or copy existing assets. Changes save locally.
3. **Check:** see problems with links to the files that need attention. Fix them, then check again. Checking does not upload anything, and a passed structural check does not establish model behavior.
4. **Publish:** connect the repository once if needed, confirm the version, enter what changed, review the destination and contents, and choose **Publish version**.
5. **Done:** open the source, `.skill` and changelog links. Choose **Work on another skill** when finished.

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

The upload creates a **review branch**, with links to its exact files. Merge through your repository's review process before expecting the version on the repository's default branch. The workbench does not automatically merge or track merge status. It does not upload the skill into an AI application or publish this extension to the Marketplace.

## Portable skills and application checks

The default is the [open Agent Skills format](https://agentskills.io/specification): `SKILL.md` plus optional supporting files. You can select Portable, Claude, ChatGPT/Codex, Gemini CLI or GitHub Copilot for compatibility guidance. Application-specific files such as `agents/openai.yaml` are preserved. Compatibility checks do not promise identical behavior across applications, install the skill, or run a model.

## Your work stays recoverable

- Failed checks, canceled file pickers and failed uploads retain your draft.
- A verified upload removes an unchanged completed draft from active work and archives it recoverably.
- Newer unpublished changes remain active.
- Resume saved drafts or choose a library version to edit its next version.
- If another editor changes a file, conflicting workbench edits are saved in local recovery records rather than overwriting the newer file.
- The UI uses text and icons alongside color. There are no flashing prompts; reduced-motion and high-contrast preferences are respected.

See [the short workflow and recovery guide](docs/workbench-guide.md).

## Requirements and development

VS Code 1.90+. Publishing requires Git, a configured commit identity, and repository access. GitHub repository discovery and creation use your signed-in GitHub CLI account. No model credentials, paid service, or global validator installation is required.

```sh
npm install
npm test
npm run package
```

Older authoring commands remain internal for compatibility. The guided workbench is the normal entry point. Local preview builds may be newer than the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=DavidFarris.skill-builder).

MIT License. See [LICENSE](LICENSE).
