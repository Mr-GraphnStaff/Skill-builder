# Claude Skill Builder

Build Anthropic / Claude Agent Skills from VS Code.

Claude Skill Builder gives you a local workbench for creating Claude-compatible `SKILL.md` folders, drafting from free-form ideas, packaging skills for Claude.ai upload, validating skill structure, and syncing skills into Claude Code for local testing.

## What It Creates

The extension creates standard Claude skill folders:

```text
skills/
  my-skill/
    SKILL.md
    references/
    scripts/
    assets/
    evals/evals.json
```

It can also create authoring notes under:

```text
workbench/
  my-skill/
    brief.md
    authoring-prompt.md
```

Only `skills/<skill-name>/` is the Claude skill deliverable. `workbench/` is for planning, notes, and iteration.

## Quick Start

1. Open a workspace in VS Code.
2. Open the Explorer sidebar.
3. Find the `Claude Skills` view.
4. Click `Skill Builder: Interactive Builder`.
5. Describe the workflow you want as normal text.
6. Click `Create Skill Draft`.

The interactive builder creates a starter `SKILL.md`, starter evals, and a workbench brief from one form.
It can also import existing reference docs, scripts, and assets while the skill is being created.

## Create A Skill From A Rough Idea

Use `Skill Builder: Interactive Builder` when you are still thinking out loud.

Good input looks like:

```text
I need a skill that turns messy Jira security architecture updates into a weekly executive-ready status report. It should use our preferred sections, flag blockers, and create copy I can paste into Confluence.
```

Optional fields let you add:

- target surface: portable, Claude.ai, Claude Code, or Claude API
- trigger description
- should-trigger and should-not-trigger examples
- inputs Claude should gather
- workflow steps Claude should follow
- workflow modules that become ordered `references/01-*.md` callout docs
- edge cases and decision points
- quality checks
- output standard
- examples, templates, and source materials
- references, assets, and progressive-disclosure plan
- reference files to create under `references/`
- existing reference files to import with the VS Code file picker
- script plan
- script stubs to create under `scripts/`
- existing script files to import with the VS Code file picker
- asset placeholders to create under `assets/README.md`
- existing asset files to import with the VS Code file picker
- eval prompts
- target-surface notes
- external systems or MCP dependencies
- security and trust notes

When detailed fields are filled in, the extension also writes a workbench creation plan:

```text
workbench/<skill-name>/creation-plan.md
```

That plan walks through trigger design, progressive disclosure, script rules, eval design, target-surface constraints, security, and the done checklist for a production-grade skill.

If you list reference or script files in the form, the extension creates starter files for them. Asset entries create notes in `assets/README.md`; use the file picker to import real templates, images, sample files, or other binary assets.

If you list workflow modules, the extension creates ordered module files:

```text
references/01-intake.md
references/02-analysis-rules.md
references/03-output-format.md
```

`SKILL.md` is updated with ordered callouts so Claude knows when to read each module.

## Add Existing Docs, Scripts, Or Assets

If you already have files, add them during Interactive Builder creation, from the Skill Editor, or by right-clicking a skill in the `Claude Skills` tree and choosing:

```text
Skill Builder: Add Supporting Files
```

Then choose where the files belong:

- `references/` for Markdown docs, policies, schemas, examples, style guides, and other material Claude should read only when needed.
- `scripts/` for deterministic helpers. Scripts should be non-interactive, support `--help`, use structured output when practical, and avoid hidden network or package-install assumptions.
- `assets/` for templates, images, sample files, static tables, and other resources used by the skill.

The extension copies the selected files into the chosen folder and adds a small `README.md` note in that folder. After adding files, update `SKILL.md` so Claude knows when to read the reference, run the script, or use the asset.

## Open The Skill Editor

Right-click a skill and choose:

```text
Skill Builder: Open Skill Editor
```

From the command palette, the extension first lists skills from the configured workspace `skills/` directory. It also includes a browse option so you can open any existing `SKILL.md` file or any folder that contains `SKILL.md`, even if it lives outside the workspace.

The editor opens a tabbed webview for:

- metadata: review and update the trigger description
- modules: inspect ordered `references/01-*.md` modules or add a new module
- files: inspect and import `references/`, `scripts/`, and `assets/`
- evals: inspect `evals/evals.json`
- package: package ZIPs, sync to Claude Code, run validation, or copy a revision prompt

## Package For Claude.ai

Right-click a skill in the `Claude Skills` tree and choose:

```text
Skill Builder: Package Skill
```

The extension writes:

```text
dist/<skill-name>.zip
```

The ZIP preserves the skill folder inside the archive, which is the structure Claude.ai expects for custom skill upload.

## Sync To Claude Code

Right-click a skill and choose:

```text
Skill Builder: Sync to Claude Code
```

By default, the extension copies the skill to:

```text
~/.claude/skills/<skill-name>/
```

You can override the destination with:

```text
skillBuilder.claudeCodeSkillsDirectory
```

After syncing, Claude Code can discover the skill from the filesystem.

## Import Or Update A Skill From Git

Right-click the `Claude Skills` view, or right-click an existing skill, and choose:

```text
Skill Builder: Import/Update Skill from Git
```

The command opens a terminal and runs the cross-platform Node importer. By default, it imports one folder from:

```text
skills/<skill-name>/
```

If you provide a repository URL, the importer clones that repository to a temporary directory and copies only the selected skill into the local `skills/` directory. If you leave the repository blank, it uses `skill-builder.config.json` `git.remote`, or `origin`, and imports from `git.baseBranch`, or `main`.

You can also run it directly:

```bash
npm run import-skill -- my-skill -- --repo https://github.com/owner/repo.git --branch main
```

For non-standard repositories, pass a source path:

```bash
npm run import-skill -- my-skill -- --repo https://github.com/owner/repo.git --source path/to/skill-folder
```

When updating an existing local skill, rerun with `--overwrite`. The importer backs up the existing folder under `workbench/.skill-import-backups/` before replacing it.

## Publish A Skill To Git

Git publishing is a manual, config-driven release step. Copy the example config first:

```bash
cp skill-builder.config.example.json skill-builder.config.json
```

Then set `git.enabled` to `true` and review the remote, branch prefix, validation, and include rules.

Right-click a skill and choose:

```text
Skill Builder: Publish Skill to Git
```

The command opens a terminal and runs the cross-platform Node publisher. The publisher stages only `skills/<skill-name>/` by default, can optionally include `workbench/<skill-name>/` and `dist/<skill-name>.zip`, runs `skills-ref validate` when configured, shows the selected files, and requires a typed confirmation before commit and push.

You can also run it directly:

```bash
npm run publish-skill -- my-skill
```

## Validate A Skill

Right-click a skill and choose:

```text
Skill Builder: Validate Skill
```

This opens an integrated terminal and runs:

```bash
skills-ref validate "<skill-path>"
```

Install `skills-ref` separately if you want validation to run locally.

## Health Check A Skill

Right-click a skill and choose:

```text
Skill Builder: Health Check
```

The health check opens a Markdown report covering frontmatter, name/folder matching, description quality, `SKILL.md` length, workflow and quality-check sections, ordered module callouts, referenced supporting files, eval JSON, script CLI hints, and obvious secret-like values.

## Commands

- `Skill Builder: Interactive Builder` opens the free-form skill intake UI.
- `Skill Builder: Open Skill Editor` opens the tabbed metadata/modules/files/evals/package editor.
- `Skill Builder: Create Skill` creates a minimal starter skill through prompts.
- `Skill Builder: Open Skill` opens the selected `SKILL.md`.
- `Skill Builder: Add Supporting Files` copies existing docs, scripts, or assets into a skill.
- `Skill Builder: Package Skill` creates a Claude.ai upload ZIP.
- `Skill Builder: Sync to Claude Code` copies a skill to the Claude Code skills folder.
- `Skill Builder: Import/Update Skill from Git` pulls one skill folder from a Git repository into the local `skills/` directory.
- `Skill Builder: Publish Skill to Git` commits and pushes a configured skill path through the manual publish script.
- `Skill Builder: Validate Skill` runs `skills-ref validate`.
- `Skill Builder: Health Check` opens a local structure and quality report.
- `Skill Builder: Copy Free-Form Chat Prompt` copies a prompt for deeper skill authoring work with an AI assistant.

## Settings

- `skillBuilder.skillsDirectory`: workspace-relative skill source directory. Default: `skills`.
- `skillBuilder.distDirectory`: workspace-relative ZIP output directory. Default: `dist`.
- `skillBuilder.claudeCodeSkillsDirectory`: sync destination for Claude Code. Default: `~/.claude/skills`.
- `skillBuilder.projectRoot`: optional project root override.

Git publish defaults live in `skill-builder.config.json`, which is intentionally ignored by git. Use `skill-builder.config.example.json` as the starting point.

## What This Extension Does Not Do

Claude Skill Builder does not upload skills into Claude.ai or the Claude API for you. It prepares the folder or ZIP artifact locally.

It also does not run Claude inside VS Code. The interactive builder creates a strong local draft and an optional authoring prompt, but deeper refinement still happens by editing the generated files or using your preferred AI assistant.

The Git workflow does not automatically merge changes into the remote default branch. Use `Publish Skill to Git` to push a branch, optionally create a PR with `gh`, and merge through your normal GitHub review process.

## Security Notes

Treat skills like installable software. Review bundled scripts, dependencies, assets, and instructions that access external systems.

Do not hardcode secrets in a skill. For external services, prefer MCP-oriented instructions and document required tools and permissions clearly.

## License

MIT License. See [LICENSE](LICENSE).

## Official References

- [How to create a skill with Claude through conversation](https://support.claude.com/en/articles/12599426-how-to-create-a-skill-with-claude-through-conversation)
- [How to create custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)
- [Use Skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Using Agent Skills with the API](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
- [Extend Claude with skills in Claude Code](https://code.claude.com/docs/en/skills)
- [Anthropic skills repository](https://github.com/anthropics/skills)

## Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Package:

```bash
npm run package
```

Publish a configured skill:

```bash
npm run publish-skill -- my-skill
```
