# Official Anthropic Skill Sources

Last checked in this repo: 2026-04-30.

This file is an index, not a frozen copy of the docs. Before making current or production deployment claims, re-check the official pages.

## Conversation-Based Skill Creation

- [How to create a skill with Claude through conversation](https://support.claude.com/en/articles/12599426-how-to-create-a-skill-with-claude-through-conversation)
- [Teach Claude your way of working using skills](https://support.claude.com/en/articles/12580051-teach-claude-your-way-of-working-using-skills)

Key guidance to preserve in this repo:

- users can describe workflows naturally
- Claude should ask about process, examples, and success criteria
- Claude creates `SKILL.md`, organizes materials, creates scripts when useful, and packages the result
- skills are best for repeatable procedures, standards, templates, and workflows that should apply across chats

## Claude.ai Skills

- [How to create custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)
- [Use Skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Provision and manage Skills for your organization](https://support.claude.com/en/articles/13119606-provisioning-and-managing-skills-for-your-organization)

Current high-level guidance:

- skills require code execution to be enabled
- custom skills are uploaded as ZIPs
- the ZIP should contain the skill folder, not loose files at ZIP root
- descriptions drive automatic invocation
- users should test several prompts after upload
- common upload errors include missing `SKILL.md`, name mismatch, invalid characters, and ZIP size problems
- install only trusted skills and review bundled scripts, dependencies, and external access instructions

## Claude Code Skills

- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Claude Code documentation index](https://code.claude.com/docs/llms.txt)

Current high-level guidance:

- skills are directories with `SKILL.md`
- personal skills live under `~/.claude/skills/<skill-name>/SKILL.md`
- project skills live under `.claude/skills/<skill-name>/SKILL.md`
- skills can be invoked directly with `/skill-name`
- Claude Code watches existing skill directories for live changes
- supporting files should be referenced from `SKILL.md`
- Claude Code-specific fields such as `allowed-tools`, `context`, and `disable-model-invocation` should be used intentionally

## Claude API Skills

- [Using Agent Skills with the API](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
- [Skills API reference](https://platform.claude.com/docs/en/api/beta/skills)

Current high-level guidance:

- skills integrate with Messages through code execution
- requests use `container.skills`
- custom skills are uploaded and versioned through the Skills API
- current limits include up to 8 skills per request and upload size limits
- current API runtime constraints include no network access, no runtime package installation, and isolated containers
- production requests should pin specific versions when stability matters

## Anthropic Skill Examples

- [Anthropic skills repository](https://github.com/anthropics/skills)
- [Anthropic skill-creator skill](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)

Use these as style and structure references. The `skill-creator` skill is especially relevant because it captures Anthropic's current loop for drafting, testing, reviewing, and improving skills.

## Portable Supplement

- [Agent Skills open standard](https://agentskills.io/specification)

Use this to improve portability, but prefer official Anthropic docs for Claude.ai, Claude Code, Claude API, packaging, runtime, and beta-header behavior.
