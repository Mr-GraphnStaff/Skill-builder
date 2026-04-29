# Claude Skill Builder

VS Code extension for managing Anthropic / Claude Agent Skills in this workspace.

Codex is used to author and maintain the extension, but the skill artifacts remain Claude-compatible `SKILL.md` folders under `skills/`.

## Current MVP

- Lists skills from `skills/<skill-name>/SKILL.md` in the Explorer sidebar.
- Opens a skill manifest from the tree view.
- Creates a new Anthropic-compatible skill folder with `SKILL.md`, supporting folders, and starter evals.
- Packages a skill folder into `dist/<skill-name>.zip` for Claude upload.
- Starts `skills-ref validate <skill-path>` in an integrated terminal.

The extension uses the Skill Builder project root for both `skills/` and `dist/`. If VS Code is opened one folder above this repo, it auto-detects the `Skill-builder` child folder. You can override this with `skillBuilder.projectRoot`.

## Local Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Run the extension:

1. Open this repo in VS Code.
2. Press `F5` or run `Debug: Start Debugging`.
3. In the Extension Development Host window, open the Explorer sidebar.
4. Use the `Claude Skills` view.

## VS Code Extension Process

The standard VS Code extension flow is:

1. Define extension metadata, commands, views, activation, and configuration in `package.json`.
2. Register command handlers and VS Code providers from `src/extension.ts`.
3. Compile TypeScript into `out/`.
4. Run and debug with an Extension Development Host.
5. Package the VS Code extension as a `.vsix` when ready:

```bash
npm run package
```

The `.vsix` is the installable VS Code extension package. It is separate from Claude skill upload ZIPs and from dot-skill `.skill` persona files.

## Skill Packaging Later

The extension has a `Package Skill` command that writes:

```text
dist/<skill-name>.zip
```

Use the `.zip` file for Claude.ai upload. Do not rename Claude `SKILL.md` packages to `.skill`: dot-skill uses `.skill` for a separate persona-distillation ecosystem. Claude.ai, Claude Code, the Claude API, and dot-skill have different distribution paths, so deployment should stay target-specific.

## References

- https://code.visualstudio.com/api/get-started/your-first-extension
- https://code.visualstudio.com/api/references/extension-manifest
- https://code.visualstudio.com/api/references/contribution-points
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
