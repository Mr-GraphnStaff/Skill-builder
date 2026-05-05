# Conversation-First Skill Authoring Workflow

This workflow is for turning free-form chat into Anthropic / Claude Agent Skills.

Use it when a user says things like:

- "I want a skill for..."
- "Can you turn this process into a Claude skill?"
- "I keep telling Claude to do this the same way."
- "Build a skill from this template/process/example."
- "Improve this existing skill."

## 1. Start With The User's Words

Do not make the user complete a rigid intake form before helping. Capture the useful parts of the conversation:

- the repeated task
- who uses the skill
- what good output looks like
- examples or templates the user already has
- required inputs
- required output format
- target Claude surface, if known
- external tools or MCP dependencies, if any

If a detail is missing but not blocking, choose the portable default and document the assumption.

Ask at most 1-2 clarifying questions when the answer changes the design materially. Good questions are specific:

- "Should this target Claude.ai upload, Claude Code local testing, or the Claude API?"
- "Does this need live access to Jira through MCP, or should it only produce Jira-ready text?"

## 2. Classify The Skill

Classify the requested skill before writing:

- reference skill: applies standards, style, policies, or domain knowledge
- task skill: follows a repeatable procedure
- tool/MCP skill: teaches Claude how to use a connector or external system
- file-production skill: creates documents, spreadsheets, slides, PDFs, code, or media
- evaluation/reviewer skill: critiques, grades, or improves outputs

This classification affects structure:

- reference skills usually need concise rules and examples
- task skills need steps, checkpoints, and edge cases
- tool/MCP skills need prerequisites, operation order, and failure handling
- file-production skills often need templates, assets, and scripts
- reviewer skills need rubrics and assertion-style output checks

## 3. Build The Brief

Create or update:

```text
workbench/<skill-name>/brief.md
```

Use `templates/skill-brief.md` as the starting point.

The brief is not the deliverable. It is the authoring memory for the current skill: decisions, assumptions, examples, and evaluation ideas.

Do not put private scratch notes in `skills/<skill-name>/` unless they should ship with the skill.

## 4. Design The Skill Boundary

A good skill does one repeatable workflow. Before drafting, decide what is out of scope.

Prefer multiple focused skills when:

- the workflow has unrelated audiences
- there are unrelated output types
- the tool requirements differ materially
- one part should trigger often and another should trigger rarely
- one part is safe to run automatically and another needs explicit invocation

Skills can compose naturally when Claude sees multiple relevant skills. Do not create one large skill just because several workflows might be used in the same business process.

## 5. Draft SKILL.md

Create:

```text
skills/<skill-name>/SKILL.md
```

Use this structure unless the skill calls for something more specific:

```md
---
name: <skill-name>
description: <what it does>. Use when <trigger contexts>.
---

# <Human Title>

## Purpose

State the repeatable workflow and success condition.

## Use This Skill When

List the strongest trigger contexts in natural language.

## Inputs To Gather

List the minimum inputs Claude should look for or ask about.

## Workflow

Give the step-by-step procedure.

## Quality Checks

List the checks Claude should apply before final output.

## Supporting Files

Explain when to read references, use assets, or run scripts.
```

Keep `SKILL.md` lean. Move long details to supporting files.

## 6. Add Supporting Files Only When Useful

Use `references/` for information Claude should read only in specific branches:

- brand rules
- field maps
- process details
- schemas
- examples
- API or MCP notes

Use `assets/` for files Claude should use as inputs or templates:

- DOCX/PPTX/XLSX templates
- logos
- style samples
- static lookup tables

Use `scripts/` for deterministic operations:

- parsing
- validation
- transformations
- file generation
- checks that are hard to express reliably in prose

Every script needs `--help` and non-interactive behavior.

## 7. Create Evals Early

Create:

```text
skills/<skill-name>/evals/evals.json
```

Start with a few realistic prompts instead of trying to exhaustively test everything.

Minimum set:

- happy path
- incomplete-input edge case
- trigger-sensitive case, if relevant

For trigger-sensitive skills, include:

- prompts that should trigger
- prompts that should not trigger

## 8. Iterate Like Anthropic's Skill-Creator Pattern

The current Anthropic `skill-creator` skill emphasizes an iterative loop:

1. draft the skill
2. write realistic test prompts
3. run or simulate the prompts
4. review outputs
5. improve the skill by generalizing from failures
6. rerun tests

When improving a skill, avoid narrow patches that only fix one eval prompt. Instead, identify the general instruction, reference, example, or script that would improve future runs.

## 9. Validate, Package, Sync

Before calling the work done:

- verify `name` matches the directory
- verify frontmatter parses
- verify all referenced files exist
- run `skills-ref validate ./skills/<skill-name>` when available
- compile or test scripts when present
- run the extension package command for Claude.ai ZIPs when requested
- run the extension sync command for Claude Code local testing when requested

## 10. Target-Surface Notes

Portable default:

- no network assumption
- no runtime install assumption
- no product-specific fields unless needed

Claude.ai:

- package as ZIP with the skill folder inside
- keep description short
- test with several prompts after upload

Claude Code:

- sync to `~/.claude/skills/<skill-name>/`
- direct invocation is `/skill-name`
- Claude Code-specific frontmatter can be used intentionally

Claude API:

- verify current beta headers and request shape before documenting
- code execution is required
- current API runtime has no network access or runtime package installation
- pin versions for production use
