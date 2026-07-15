# Skill Creation Plan

## Skill

- name: `ceate-a-test-skill`
- target surface: portable Anthropic skill
- description: Support ceate a test skill workflows. Use when the user asks for ceate a test skill
- skill type: reviewer/evaluator

## Official Authoring Loop

Use this plan to iterate the skill before considering it production-ready:

1. Confirm the user intent and repeated workflow.
2. Tune the description for triggering: what it does plus when Claude should use it.
3. Keep `SKILL.md` as the concise operating guide.
4. Move long procedures, schemas, examples, and policies into `references/`.
5. Use scripts only for deterministic, non-interactive operations with `--help`.
6. Add evals that cover happy path, incomplete input, edge cases, and trigger boundaries.
7. Validate structure and package or sync for the target surface.

## Intake Summary

ceate a test skill

## Trigger Design

### Should Trigger

-

### Should Not Trigger

-

### Description Check

- Specific enough to distinguish this skill from neighboring skills.
- Includes the user's real trigger terms.
- Avoids broad phrases like "help with anything".
- Claude.ai target stays under the shorter description limit.

## Workflow Design

### Inputs To Gather

-

### Procedure

-

### Edge Cases

-

### Quality Checks

-

### Output Standard

-

## Progressive Disclosure

### Source Materials

-

### References, Assets, Scripts

assets/python.py
assets/template.docx
assets/skillaudit.md

### Reference Files To Create

- always be like hunter s thompson

### Script Rules

-

### Script Stubs To Create

-

### Asset Placeholders To Create

-

Any script added later should be non-interactive, document `--help`, write structured stdout when possible, write diagnostics to stderr, and avoid hidden network/package-install assumptions.

## Evaluation Plan

-

Minimum eval set to add or refine:

- happy path task
- incomplete input task
- edge case task
- should-trigger prompts
- should-not-trigger prompts

## Target-Surface Constraints

- Keep the skill portable by default.
- Do not assume network access, runtime package installation, or MCP availability unless requested.
- Avoid product-specific frontmatter unless a target surface requires it.

-

## External Systems And Security

-

-

Never hardcode secrets. Prefer MCP/tool dependencies with explicit permissions and failure handling.

## Done Checklist

- `SKILL.md` has valid YAML frontmatter.
- `name` matches the folder name.
- `description` is trigger-specific.
- Workflow is focused and repeatable.
- Supporting files are referenced only when useful.
- Scripts are non-interactive and documented.
- Evals cover task quality and trigger behavior.
- Target-surface assumptions are explicit.
- `skills-ref validate ./skills/ceate-a-test-skill` runs or the limitation is recorded.
