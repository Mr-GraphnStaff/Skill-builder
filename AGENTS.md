# Blueprint for Codex to Author Claude Agent Skills

## What the repository needs to accomplish

The cleanest way to satisfy this request is to treat `AGENTS.md` as the **instruction layer for Codex** and the generated `SKILL.md` folders as the **actual Anthropic-compatible deliverables**. That distinction matters because Codex reads `AGENTS.md` before it starts work and uses it as durable repository guidance, while Anthropic’s Agent Skills standard defines a skill as a directory centered on `SKILL.md` plus optional scripts, references, and assets that load progressively. citeturn27view0turn27view1turn3view3turn8view13turn6view0

It is also worth being explicit that this repo should be **Claude-only in output format**, even though Codex is the authoring agent. Codex has its own skill system, including discovery under `.agents/skills` and optional `agents/openai.yaml` metadata, but Anthropic/Agent Skills are documented around `SKILL.md` directories and Anthropic-specific runtime surfaces such as Claude.ai, Claude Code, and the Claude API. A good `AGENTS.md` should therefore tell Codex to generate Anthropic-style skills and to avoid Codex-native skill packaging unless the user explicitly asks for it. citeturn29view0turn8view13turn16view0

The most important design decision is to make the repository target the **open Agent Skills specification first**, then layer on Anthropic product-specific overrides. That is the safest approach because the open spec defines the portable baseline, while Anthropic’s product docs add surface-specific constraints such as Claude.ai upload packaging, API beta headers, and runtime differences across Claude.ai, Claude Code, and the API. citeturn3view2turn18view4turn21view4turn22view3turn17view3

## The implementation rules Codex should follow

At minimum, each skill should be a directory containing `SKILL.md`. The open spec and Anthropic docs both describe optional `scripts/`, `references/`, and `assets/` directories, and both require the directory name to match the `name` field in frontmatter. The `name` should be lowercase, hyphenated, and short; Anthropic’s authoring docs add stricter validation such as a 64-character maximum and reserved-word restrictions for names like `anthropic` and `claude`. citeturn8view13turn18view6turn16view0turn9view9turn10view0

The `description` field is the most important trigger surface. The open spec says it should explain what the skill does and when to use it; Anthropic’s best-practices page says it should be specific, include key terms, and support discovery across potentially large skill sets; the Agent Skills optimization guide says it should focus on user intent and strongly signal triggering contexts. In practice, the best cross-compatible pattern is a hybrid description such as: “Analyze CSV and tabular data files to compute statistics and charts. Use when the user asks to explore, clean, transform, or visualize spreadsheet-like data.” citeturn18view4turn9view0turn31view0

There is one important cross-surface mismatch that your repo docs should explicitly call out. The open specification allows descriptions up to 1024 characters, while Claude.ai’s upload flow currently limits descriptions to 200 characters. Similarly, the open spec documents optional fields such as `license`, `compatibility`, `metadata`, and experimental `allowed-tools`, while Claude.ai’s custom-skills guide shows a `dependencies` example that is not part of the core open specification. The safest instruction for Codex is: build to the open spec by default, then add platform-specific extensions only when a target surface requires them. citeturn18view4turn18view5turn18view6turn18view1turn21view4turn22view1

The body of `SKILL.md` should stay concise and work like an onboarding guide or table of contents. Both Anthropic and Agent Skills docs recommend keeping the main body under 500 lines and using progressive disclosure: put the essential workflow in `SKILL.md`, then push detailed references, examples, templates, and advanced branches into separate files that Claude can load on demand. File references should be relative and kept one level deep from `SKILL.md`, rather than chaining through deeply nested documents. citeturn3view2turn8view13turn8view4turn8view5turn14search8

When a skill uses scripts, the repo instructions should require agent-friendly scripts rather than human-centric ones. The spec says scripts should be self-contained or clearly document dependencies. The scripting guide adds stricter operational rules: scripts must be non-interactive, should expose `--help`, should return structured output such as JSON/CSV/TSV instead of ambiguous prose, and should emit useful errors that explain what went wrong and how to fix it. citeturn22view0turn32view0turn32view1turn32view2turn32view3

Finally, the docs should instruct Codex to validate and evaluate every non-trivial skill. The open spec recommends validating with `skills-ref validate`. The Agent Skills evaluation docs recommend storing structured test cases in `evals/evals.json`, starting with a few realistic prompts, then comparing with-skill and without-skill runs in clean contexts. The description-optimization docs further recommend about twenty trigger-eval queries split into should-trigger and should-not-trigger sets, then iterating on the description based on trigger rates. citeturn8view13turn30view0turn31view0

## The surface-specific constraints Codex must respect

Anthropic’s “write once, adapt by surface” story is real, but the runtime details are not identical. Claude.ai supports custom-skill uploads as ZIP files, requires the skill directory to be preserved inside the archive, and asks you to enable the skill in Settings after upload. Claude Code discovers custom skills from the filesystem rather than uploads, while the API lets you upload custom skills into a workspace and manage them through the Skills API. Anthropic’s platform overview explicitly says custom skills are available across Claude’s products, but the creation and distribution path depends on the surface. citeturn21view0turn21view2turn11view3turn10view1turn14search3

Claude Code has its own discovery model and is especially relevant if you want Codex-generated skills to be easy to test locally. Claude Code supports personal skills in `~/.claude/skills/<skill-name>/SKILL.md`, project skills in `.claude/skills/<skill-name>/SKILL.md`, and plugin-distributed skills. Its own docs frame skills as the right place for reusable workflows and reference material, in contrast to `CLAUDE.md`, which is for always-on project conventions. That makes it reasonable for your repo to store source skills in a neutral `skills/` directory and only mirror or package them into `.claude/skills/` when specifically testing in Claude Code. citeturn11view3turn11view9turn28view1turn28view2turn16view7

The API path is stricter than Claude.ai or Claude Code. Anthropic’s Skills API docs say Skills in Messages require the code execution tool plus the beta headers `code-execution-2025-08-25`, `skills-2025-10-02`, and `files-api-2025-04-14`; custom skills are uploaded to the workspace; and requests can include up to eight skills in the `container.skills` parameter. Those same docs also make clear that the API runtime has **no network access** and **no runtime package installation**, so Codex should not generate API-targeted skills that assume live internet access or `pip install` during execution. citeturn17view3turn10view3turn17view6turn22view3

Claude.ai and Claude Code have different operational assumptions. Anthropic’s best-practices docs say Claude.ai can install packages from npm and PyPI and may or may not have network access depending on settings, while Claude Code inherits the local machine’s network environment. That means repository instructions should force Codex to ask one clarifying question—or default to a conservative portable baseline—whenever a requested skill depends on networking, package installation, or an MCP connection. citeturn22view2turn22view3turn16view5turn16view6

Two governance notes should also be captured in the repo docs. First, Anthropic warns that skills should be treated like installable software because malicious skills can misuse tools, exfiltrate data, or load hostile external content. Second, Agent Skills are not currently eligible for Zero Data Retention; Anthropic says skill definitions and execution data follow standard retention policy. If the skills you plan to author touch sensitive workflows, that should be stated plainly in the README. citeturn23view0turn23view1turn23view2

The right way to connect external systems is MCP. Anthropic’s own docs frame Skills and MCP as complementary—MCP provides the connection, and the skill teaches the model how to use it well. The MCP documentation itself describes MCP as an open standard for connecting AI applications to external systems through tools, resources, and prompts. So the AGENTS instructions should explicitly tell Codex: when a skill needs SaaS, database, or internal-tool access, describe the required MCP dependency and workflow, rather than hardcoding secrets or inventing unsupported network behavior. citeturn28view3turn16view5turn16view6turn23view4

## Drop-in AGENTS.md

The draft below is aligned with the documented behavior of Codex `AGENTS.md`, Anthropic’s Skill structure and best practices, the open Agent Skills specification, and the surface-specific constraints across Claude.ai, Claude Code, and the Claude API. citeturn27view0turn27view1turn8view13turn9view0turn8view4turn32view0turn22view3turn17view3

```md
# AGENTS.md

## Purpose

This repository exists to create **Anthropic / Claude Agent Skills** only.

You are acting as an authoring agent inside this repo. Your job is to create:
- Anthropic-compatible skill folders
- `SKILL.md` files
- optional `references/`, `scripts/`, `assets/`, and `evals/` content
- packaging artifacts such as `.zip` files only when explicitly requested

Do **not** create OpenAI/Codex-native skill packages, `.agents/skills/`, or `agents/openai.yaml` unless the user explicitly asks for Codex-native skills.
This repo is for **Claude-only outputs**.

## Default repository layout

Unless the user asks for a different layout, create skills under:

- `skills/<skill-name>/SKILL.md`
- `skills/<skill-name>/references/`
- `skills/<skill-name>/scripts/`
- `skills/<skill-name>/assets/`
- `skills/<skill-name>/evals/evals.json`

Keep source skills in `skills/`.
Only mirror or package them for a target runtime surface when explicitly requested.

## First decision before you build

Before generating or revising a skill, determine the target surface:

- **portable / open-standard default**
- **Claude.ai**
- **Claude Code**
- **Claude API**

If the user does not specify a surface, default to:
- an open-standard Anthropic-compatible skill
- conservative runtime assumptions
- no dependence on runtime package installs
- no dependence on network access
- no dependence on MCP unless the user requests it

If a request clearly depends on MCP, external services, or product-specific runtime behavior, ask one concise clarifying question only if required.
Otherwise, choose the safest portable baseline and document assumptions.

## Core authoring rules

### Skill identity

Every skill must be a directory with a `SKILL.md` file.

The directory name must match the frontmatter `name`.

Use a kebab-case skill name:
- lowercase letters
- numbers allowed
- hyphens allowed
- no spaces
- no uppercase
- max 64 characters

Avoid reserved Anthropic-facing names such as:
- `anthropic`
- `claude`

### Frontmatter

Every `SKILL.md` must begin with YAML frontmatter.

Required fields:
- `name`
- `description`

Optional open-standard fields:
- `license`
- `compatibility`
- `metadata`
- `allowed-tools` (experimental; only use when intentionally targeting a client that supports it)

Do **not** add arbitrary frontmatter fields by default.

If the target is **Claude.ai**, you may add platform-specific fields only when clearly useful and explicitly note that they are platform-specific.
Treat fields such as `dependencies` as product-specific extensions rather than part of the portable baseline.

### Description quality

The `description` field is the primary trigger mechanism.
It must say:
- what the skill does
- when Claude should use it

Write descriptions that are:
- specific
- discovery-friendly
- keyword-rich without being spammy
- scoped to one workflow

Preferred pattern:

`<what it does>. Use when <user intent / trigger contexts>.`

Good example:

`Analyze CSV and tabular data files to compute statistics, clean rows, and create charts. Use when the user asks to explore, transform, clean, or visualize spreadsheet-like data.`

Description length rules:
- portable / open-standard: keep under 1024 characters
- Claude.ai target: keep under 200 characters
- when in doubt: keep it short and precise

### SKILL.md body

The body should:
- focus on one repeatable workflow
- stay under 500 lines whenever possible
- include step-by-step procedures
- include examples of inputs and outputs when useful
- include edge cases and decision points when useful
- tell Claude when to read supporting files

Use progressive disclosure:
- keep the main workflow in `SKILL.md`
- move large references into separate files
- move deterministic operations into scripts

Keep file references shallow.
From `SKILL.md`, reference files using relative paths and keep references one level deep whenever possible.

### Supporting files

Use:
- `references/` for reference docs, schemas, style guides, detailed API docs
- `assets/` for templates, images, tables, sample inputs, static resources
- `scripts/` for deterministic reusable operations
- `evals/` for evaluation assets

Do not create extra folders unless they directly improve clarity or portability.

## Script rules

Only create scripts if they add real value.

Prefer plain instructions over scripts unless you need:
- deterministic transformations
- reusable validation
- structured extraction
- repeatable output generation
- mechanical grading or assertions

Any script you create must be:
- non-interactive
- runnable without TTY prompts
- explicit about inputs and outputs
- documented with `--help`
- structured on stdout
- diagnostic on stderr
- idempotent when practical
- clear in failure modes

Prefer structured stdout such as:
- JSON
- CSV
- TSV

Avoid free-form prose output if the result is meant to be consumed by Claude or another script.

If the runtime target is API, do not assume package installation or network access.
If the runtime target is Claude.ai, clearly label any package-install assumptions as Claude.ai-specific.
If the runtime target is Claude Code, note any local-machine assumptions.

## Evaluation rules

For every non-trivial skill, create at least:
- `evals/evals.json`
- 2–3 realistic task evals to start
- at least one edge case

For skills that are trigger-sensitive, also create a trigger-eval set with:
- should-trigger examples
- should-not-trigger examples

When the user asks for a production-ready skill, expand the eval set and include:
- trigger checks
- output-quality checks
- example assertions
- a note on how to compare with-skill vs without-skill runs

## Validation rules

Always validate the skill structure before you claim completion.

Preferred validation command:

```bash
skills-ref validate ./skills/<skill-name>
```

If you cannot run validation in the current environment, say so explicitly and still ensure:
- frontmatter is valid YAML
- `name` matches directory
- file references are correct
- packaging structure is correct

## Packaging rules

### Claude.ai packaging

If the target is Claude.ai:
- package as a `.zip`
- the ZIP must contain the skill directory
- do not place `SKILL.md` directly at the ZIP root

Correct:
- `my-skill.zip -> my-skill/SKILL.md`

Incorrect:
- `my-skill.zip -> SKILL.md`

### Claude Code testing

If the target is Claude Code:
- keep source files in `skills/`
- if asked to prepare for live testing, provide the mirrored path:
  - `~/.claude/skills/<skill-name>/SKILL.md` for personal testing
  - `.claude/skills/<skill-name>/SKILL.md` for project testing

### Claude API deployment

If the target is Claude API:
- document that Skills run with code execution
- mention required beta headers
- mention Files API dependency for generated files
- avoid runtime assumptions that require network access or package installation
- note that uploaded custom skills are workspace-scoped

## Security rules

Never hardcode:
- API keys
- passwords
- tokens
- private endpoints
- secrets in examples

If the workflow needs external services:
- prefer MCP-oriented instructions
- document the required MCP/tool dependency
- do not invent fake network capabilities

Treat any third-party skill content like installable software.
If you are asked to adapt downloaded skill content, review it for:
- suspicious file access
- unexplained network calls
- instructions that exceed the stated purpose

## What done looks like

A skill is only done when all of the following are true:

- The output is an Anthropic-compatible skill, not a Codex-native skill package
- The skill lives under `skills/<skill-name>/`
- `SKILL.md` has valid frontmatter
- `name` matches the directory
- `description` is trigger-appropriate
- the workflow is scoped and coherent
- references/scripts/assets are only included when useful
- any scripts are non-interactive and documented
- packaging matches the target surface
- eval scaffolding exists for non-trivial skills
- validation was run or the limitation was stated explicitly
- the README or accompanying notes clearly state any target-surface assumptions

## Primary references

OpenAI Codex guidance:
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/learn/best-practices
- https://developers.openai.com/codex/concepts/customization

Agent Skills standard:
- https://agentskills.io/home
- https://agentskills.io/specification
- https://agentskills.io/skill-creation/quickstart
- https://agentskills.io/skill-creation/best-practices
- https://agentskills.io/skill-creation/optimizing-descriptions
- https://agentskills.io/skill-creation/evaluating-skills
- https://agentskills.io/skill-creation/using-scripts
- https://agentskills.io/client-implementation/adding-skills-support

Anthropic / Claude docs:
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
- https://platform.claude.com/docs/en/build-with-claude/skills-guide
- https://claude.com/docs/skills/overview
- https://claude.com/docs/skills/how-to
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/features-overview
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://platform.claude.com/cookbook/skills-notebooks-03-skills-custom-development
- https://github.com/anthropics/skills

MCP:
- https://modelcontextprotocol.io/docs/getting-started/intro
- https://modelcontextprotocol.io/docs/learn/architecture
```

## Drop-in README.md

The README draft below is written for humans, but it is also structured so Codex can use it as supporting context while following the root `AGENTS.md`. It foregrounds the repo’s real purpose, explains the Anthropic-vs-Codex distinction, and includes the official documentation index you asked for. citeturn27view1turn6view0turn16view0turn28view2turn29view0

```md
# Claude Agent Skills Authoring Repo

This repository is for creating **Anthropic / Claude Agent Skills**.

It is **not** a repo for OpenAI/Codex-native skills as the primary output.
Codex is used here as the authoring agent, but the artifacts produced by this repo are **Claude-compatible `SKILL.md` skill folders**.

## What a Claude Skill is

A Claude / Anthropic Agent Skill is a folder built around a `SKILL.md` file.
That file contains YAML frontmatter plus markdown instructions.
A skill can also include:
- `references/` for documentation
- `scripts/` for deterministic helpers
- `assets/` for templates or static resources
- `evals/` for test cases and assertions

Claude loads skills progressively:
- metadata first
- `SKILL.md` when the skill is relevant
- supporting files only when needed

## What this repo expects from Codex

Read `AGENTS.md` first.

When asked to create or edit a skill in this repo, Codex should:
1. create an **Anthropic-compatible** skill under `skills/<skill-name>/`
2. follow the open Agent Skills spec as the portability baseline
3. apply Anthropic product-specific rules only when the target surface requires them
4. avoid creating `.agents/skills/` or other Codex-native skill artifacts unless explicitly requested

## Repository layout

```text
skills/
  <skill-name>/
    SKILL.md
    references/
    scripts/
    assets/
    evals/
README.md
AGENTS.md
```

## How to ask Codex to create a skill

Use prompts like:

- `Create a new Anthropic skill called customer-briefing for writing executive customer briefings. Put it in skills/customer-briefing/ and make it portable across Claude Code and the Claude API.`
- `Create a Claude.ai-targeted skill for applying our brand guidelines to presentations. Keep the description under Claude.ai limits and package it as a ZIP.`
- `Revise skills/csv-analysis/ so it adds evals/evals.json, a validation script, and clearer trigger descriptions.`

If your request depends on external systems, be explicit:

- target surface: Claude.ai / Claude Code / Claude API
- whether network access is allowed
- whether MCP is available
- whether package installation is allowed
- whether you need a ZIP artifact

## Authoring rules

### Portable default

If no surface is specified, the repo defaults to a **portable, open-standard Anthropic skill**.

That means:
- use the standard skill folder structure
- use only spec-safe frontmatter unless necessary
- avoid assuming runtime package installation
- avoid assuming network access
- document assumptions clearly

### `SKILL.md` rules

Every `SKILL.md` should:
- start with YAML frontmatter
- include required `name` and `description`
- use a `name` that matches the directory
- keep the main body concise
- focus on one repeatable workflow
- include examples when helpful
- use references/scripts/assets only when they add value

### Description rules

The description determines triggering.
Make it specific about:
- what the skill does
- when the skill should be used

Preferred format:

`<what it does>. Use when <trigger contexts>.`

Examples:
- `Analyze CSV and tabular data files to compute statistics and charts. Use when the user asks to clean, transform, explore, or visualize spreadsheet-like data.`
- `Apply Acme presentation brand rules. Use when the user asks for decks, slides, templates, or branded presentation formatting.`

### Surface-specific description limits

- Open Agent Skills spec: up to 1024 characters
- Claude.ai upload flow: shorter practical limit; keep descriptions under 200 characters when the target is Claude.ai

## Scripts rules

Only create scripts when they improve reliability or repeatability.

Any script in this repo should be:
- non-interactive
- runnable without prompts
- explicit about inputs and outputs
- documented with `--help`
- structured on stdout
- diagnostic on stderr
- safe to retry where practical

Prefer:
- JSON
- CSV
- TSV

Avoid unclear free-form output where machine-readable output would be better.

## Evaluation rules

For non-trivial skills, add:
- `evals/evals.json`
- realistic prompts
- expected outputs
- at least one edge case
- trigger tests for should-trigger / should-not-trigger behavior when relevant

The goal is to evaluate both:
- whether the skill **loads when it should**
- whether the skill **produces better outputs than no skill or the previous version**

## Validation rules

Preferred validator:

```bash
skills-ref validate ./skills/<skill-name>
```

Also manually verify:
- YAML frontmatter parses correctly
- `name` matches the directory
- the skill is well-scoped
- all referenced files exist
- packaging is correct for the target surface

## Packaging and deployment

### Claude.ai

For Claude.ai:
- upload a ZIP
- preserve the skill directory inside the ZIP
- do not put files directly at ZIP root
- after upload, enable the skill in Settings > Capabilities
- test prompts that should trigger it

### Claude Code

For Claude Code:
- skills are discovered from the filesystem
- testing usually means copying or mirroring the skill into:
  - `~/.claude/skills/<skill-name>/`
  - or `.claude/skills/<skill-name>/`

### Claude API

For the Claude API:
- custom skills are uploaded to the workspace
- Skills run with code execution
- the API path requires the Skills, code execution, and Files API betas
- the API runtime does not allow internet access
- the API runtime does not allow runtime package installation
- generated files are downloaded through the Files API

## Security notes

- Never hardcode secrets in a skill
- Review third-party or downloaded skills before enabling them
- Prefer MCP for external system access
- Treat skills like installable software when considering trust and review
- Anthropic currently documents Agent Skills as not eligible for Zero Data Retention

## Documentation index

### Codex authoring guidance
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/learn/best-practices
- https://developers.openai.com/codex/concepts/customization

### Agent Skills open standard
- https://agentskills.io/home
- https://agentskills.io/specification
- https://agentskills.io/skill-creation/quickstart
- https://agentskills.io/skill-creation/best-practices
- https://agentskills.io/skill-creation/optimizing-descriptions
- https://agentskills.io/skill-creation/evaluating-skills
- https://agentskills.io/skill-creation/using-scripts
- https://agentskills.io/client-implementation/adding-skills-support

### Anthropic and Claude docs
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
- https://platform.claude.com/docs/en/build-with-claude/skills-guide
- https://claude.com/docs/skills/overview
- https://claude.com/docs/skills/how-to
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/features-overview
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf?hsLang=en
- https://platform.claude.com/cookbook/skills-notebooks-01-skills-introduction
- https://platform.claude.com/cookbook/skills-notebooks-03-skills-custom-development
- https://github.com/anthropics/skills
- https://github.com/anthropics/skills/blob/main/template/SKILL.md

### MCP
- https://modelcontextprotocol.io/docs/getting-started/intro
- https://modelcontextprotocol.io/docs/learn/architecture
```

## The documentation set these files should reference

If you want the repo to feel complete rather than merely functional, the documentation section should cover **four families of primary sources**: the Agent Skills open standard, Anthropic’s product-and-authoring docs, MCP docs, and Codex guidance on how `AGENTS.md` behaves. That combination gives Codex the right authoring contract and gives human maintainers the right implementation references. citeturn3view3turn6view0turn16view5turn27view0

For the **open standard**, the must-link set is: the Agent Skills overview, the formal specification, quickstart, best-practices guide, description-optimization guide, evaluation guide, scripts guide, and the “add skills support” client-implementation guide. Together, those documents cover the portable folder format, frontmatter constraints, progressive disclosure, trigger tuning, evaluation structure, script design, and client integration. citeturn12search1turn12search6turn3view4turn16view3turn31view0turn30view0turn16view4turn12search7

For **Anthropic’s own docs**, the highest-value links are: Agent Skills overview, API quickstart, authoring best practices, enterprise guidance, the API skills guide, Claude.ai’s Skills overview and custom-skills how-to, Claude Code’s skills page and feature-comparison page, the engineering blog post, and Anthropic’s longer PDF playbook and cookbook notebooks. Those are the sources that document where skills run, how they are packaged, how they are uploaded, how they are tested, and how Anthropic itself thinks about real-world skill authoring. citeturn6view0turn6view1turn6view2turn6view3turn6view4turn16view1turn16view0turn3view0turn28view0turn3view9turn3view8turn16view2

For **examples and templates**, Anthropic’s open-source `anthropics/skills` repo is the most useful canonical reference. It explicitly says the repository contains Anthropic’s implementation of skills for Claude, provides a top-level README, a template skill, and many concrete examples such as document skills and workflow skills. If you want Codex to imitate the style of real Anthropic skills, this repo belongs in both `AGENTS.md` and `README.md`. citeturn3view10turn24search7turn24search0turn24search5

For **MCP**, the minimal set is the intro page and architecture page. They explain that MCP is an open standard for connecting AI applications to external systems and that its core primitives include tools, resources, and prompts. Those two references are enough to justify repo instructions like “prefer MCP for external-service access” and “document MCP dependencies rather than inventing network behavior inside the skill.” citeturn16view5turn16view6

For **Codex**, the must-link set is the AGENTS.md guide, Codex best practices, and the customization overview. Those are the pages that explain that Codex loads `AGENTS.md` before working, that a good `AGENTS.md` should cover repo layout, commands, conventions, constraints, and definition of done, and that `AGENTS.md`, memories, skills, MCP, and subagents are distinct customization layers. They are the reason the repo should use `AGENTS.md` to steer Codex toward producing Claude-compatible skills rather than relying on one-off prompting. citeturn27view0turn27view1turn27view2