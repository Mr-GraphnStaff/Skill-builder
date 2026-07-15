# AGENTS.md

## Mission

This repository is a conversation-first workbench for creating, revising, validating, packaging, and syncing Anthropic / Claude Agent Skills.

Codex is the authoring agent, but the deliverables are Claude-compatible skill folders centered on `SKILL.md`. Do not create OpenAI/Codex-native skill packages, `.agents/skills/`, or `agents/openai.yaml` unless the user explicitly asks for Codex-native output.

The spirit of this repo is:

- start from free-form chat, rough ideas, examples, templates, and workflow notes
- turn those materials into high-quality Claude Skills
- keep the skills aligned with current official Anthropic guidance
- make it easy to test locally in Claude Code and package for Claude.ai or the Claude API

## Current Official Sources

Anthropic skill behavior changes over time. When the user asks for current, latest, production-ready, Claude.ai, Claude Code, Claude API, deployment, package, beta, or runtime behavior, verify against official sources before making claims.

Prefer these sources:

- https://support.claude.com/en/articles/12599426-how-to-create-a-skill-with-claude-through-conversation
- https://support.claude.com/en/articles/12512198-how-to-create-custom-skills
- https://support.claude.com/en/articles/12512180-use-skills-in-claude
- https://platform.claude.com/docs/en/build-with-claude/skills-guide
- https://platform.claude.com/docs/en/api/beta/skills
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/llms.txt
- https://github.com/anthropics/skills
- https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md

Use the open Agent Skills specification as a portability supplement, not as a replacement for official Anthropic product guidance.

## Repository Layout

Source deliverables live under `skills/`:

```text
skills/
  <skill-name>/
    SKILL.md
    references/
    scripts/
    assets/
    evals/evals.json
```

Authoring workspace artifacts live outside the packaged skill:

```text
workbench/
  <skill-name>/
    brief.md
    runs/
docs/
templates/
dist/
```

Keep scratch notes, transcripts, and iteration logs in `workbench/`, not inside `skills/<skill-name>/`, unless the content is meant to ship with the skill.

## Conversation-First Authoring Flow

When the user free-forms an idea for a skill, do not force them into a rigid form. Convert their natural-language request into a structured skill brief.

Default loop:

1. Capture the goal, target users, repeated workflow, examples, quality bar, and target surface.
2. Ask at most 1-2 clarifying questions only when missing information would materially change the skill.
3. Choose a conservative default when the missing detail is not blocking.
4. Draft or update `workbench/<skill-name>/brief.md`.
5. Create or revise `skills/<skill-name>/SKILL.md`.
6. Add only useful supporting files in `references/`, `scripts/`, and `assets/`.
7. Add eval scaffolding under `evals/evals.json`.
8. Validate structure and run available checks.
9. Package or sync only when the user asks or when it is clearly part of the task.

Use `docs/skill-chat-workflow.md` and `templates/skill-brief.md` as the local authoring playbook.

## Target Surface Decision

Before generating or revising a skill, identify the target surface:

- portable Anthropic skill, the default when unspecified
- Claude.ai
- Claude Code
- Claude API

If unspecified, default to portable:

- `SKILL.md` folder structure
- lowercase kebab-case `name`
- no runtime network dependency
- no runtime package installation dependency
- no MCP dependency unless requested
- no product-specific frontmatter unless needed

If a skill depends on external tools, SaaS, databases, internal systems, runtime package installation, or network access, either ask one concise question or document the conservative assumption.

## Skill Structure Rules

Every deliverable skill must have:

- a directory under `skills/<skill-name>/`
- `skills/<skill-name>/SKILL.md`
- YAML frontmatter at the top of `SKILL.md`
- `name` and `description` frontmatter
- a frontmatter `name` that matches the directory

Use skill names that are:

- lowercase
- kebab-case
- letters, numbers, and hyphens only
- 64 characters or fewer
- not reserved Anthropic-facing names such as `anthropic` or `claude`

The `description` is the trigger surface. It must explain what the skill does and when Claude should use it.

Preferred pattern:

```text
<what it does>. Use when <user intent, documents, workflow, or trigger terms>.
```

Description limits:

- Claude API/open portable baseline: keep under 1024 characters.
- Claude.ai upload flow: keep under 200 characters.
- When in doubt, keep it short, specific, and trigger-rich.

## SKILL.md Body Rules

The body should be a lean operating guide, not a documentation dump.

Include:

- the repeatable workflow
- when to use supporting files
- examples of good inputs and outputs when helpful
- decision points and edge cases
- validation or quality checks

Avoid:

- broad "do everything" skills
- overfitted instructions that only work for one example
- unexplained all-caps mandates
- long reference material that should be in `references/`
- secrets, tokens, private endpoints, or credentials

Keep `SKILL.md` under 500 lines whenever practical. Use progressive disclosure:

- metadata first
- `SKILL.md` for the core workflow
- supporting files only when needed
- scripts for deterministic operations

## Supporting Files

Use supporting files only when they make the skill more reliable or easier to maintain.

- `references/`: style guides, policies, schemas, detailed procedures, API notes
- `scripts/`: deterministic helpers, validation, structured extraction, repeatable file generation
- `assets/`: templates, images, static resources, sample files
- `evals/`: skill test cases, trigger checks, assertions, expected outputs

Reference supporting files from `SKILL.md` with clear instructions about when Claude should read or run them.

## Script Rules

Only create scripts when they add real reliability.

Scripts must be:

- non-interactive
- documented with `--help`
- explicit about inputs and outputs
- structured on stdout when consumed by Claude or tooling
- diagnostic on stderr
- safe to rerun where practical
- clear about dependencies

Prefer JSON, CSV, or TSV output over prose when a script result will be consumed by another agent or process.

For Claude API-targeted skills, do not assume network access or runtime package installation.

## Evaluation Rules

For every non-trivial skill, create or update `evals/evals.json`.

Start with:

- 2-3 realistic prompts
- at least one edge case
- expected output descriptions
- trigger examples for should-trigger and should-not-trigger behavior when triggering is important

For production-ready skills, expand evals to include:

- trigger checks
- output-quality assertions
- examples that cover important workflow variants
- notes for comparing with-skill and without-skill behavior

When improving a skill, generalize from eval failures instead of patching only the exact wording of one prompt.

## Surface-Specific Rules

### Claude.ai

- Package as `.zip`.
- Preserve the skill folder inside the ZIP.
- Do not put `SKILL.md` directly at the ZIP root.
- Keep the description under the Claude.ai practical limit.
- Document any package-install assumptions as Claude.ai-specific.

### Claude Code

- Keep source skills in `skills/`.
- For local testing, sync or mirror to `~/.claude/skills/<skill-name>/SKILL.md` or a project `.claude/skills/<skill-name>/SKILL.md`.
- Claude Code-specific fields such as `allowed-tools`, `context`, or `disable-model-invocation` are allowed only when intentionally targeting Claude Code.
- Remember that Claude Code can invoke skills directly with `/skill-name`.

### Claude API

- Skills run through code execution and the `container.skills` request shape.
- Use the current official API docs for beta headers and request details.
- Current API constraints include no network access, no runtime package installation, isolated containers, up to 8 skills per request, and upload size limits.
- If generated files are part of the workflow, document Files API download behavior.
- For production API use, prefer pinning a skill version instead of always using `latest`.

## Packaging And Sync

This repo's VS Code extension can:

- open an interactive free-form intake builder that writes a workbench brief and starter skill
- create starter skill folders
- package a skill to `dist/<skill-name>.zip`
- run `skills-ref validate <skill-path>` in a terminal
- sync a selected skill to Claude Code's personal skills folder

Packaging and sync are deployment steps. Do not confuse:

- Claude skill ZIPs for Claude.ai upload
- Claude Code filesystem skills
- Claude API workspace uploads
- VS Code `.vsix` extension packages

## Security Rules

Treat skills like installable software.

Never hardcode:

- API keys
- passwords
- access tokens
- private endpoints
- real secrets in examples

For external systems, prefer MCP-oriented instructions. Document required MCP tools, connectors, permissions, and data boundaries instead of inventing unsupported network behavior.

Review third-party or downloaded skill content for:

- suspicious file access
- unexplained network calls
- prompt-injection-prone external content
- scripts or dependencies unrelated to the stated purpose

## Done Definition

A skill authoring task is done when:

- the output is Claude-compatible, not Codex-native
- the skill lives under `skills/<skill-name>/`
- `SKILL.md` frontmatter is valid
- `name` matches the directory
- `description` is trigger-appropriate
- the workflow is scoped, repeatable, and coherent
- supporting files are referenced only when useful
- scripts, if any, are non-interactive and documented
- eval scaffolding exists for non-trivial skills
- target-surface assumptions are documented
- validation was run, or the limitation is stated clearly
- packaging or sync was completed if requested
