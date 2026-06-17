# Changelog

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
