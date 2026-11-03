# SkillJetty feature proposal: portable skills and Claude plugin bundles

Status: proposed, November 3, 2026. Documentation only; no implementation,
Marketplace publication, organization deployment, or release-freeze exception
is established by this proposal.

Subsequent owner authorization: implement and publish the complete pre-release
after verification, including public-directory local preflight and explicit
local archiving. The active plugin repository folder is now `Plugins/<name>`
(install root `Plugins/<name>/source`), updated through review PRs. Earlier
versioned-remote-layout examples below are superseded by this decision; immutable
local releases and Git history preserve prior versions. Portable-only paths stay
unchanged. Existing legacy repository cleanup is never automatic.

## Goal

SkillJetty by DAF-TECH should author one portable skill source and support
explicit export choices: Portable skill only (the existing default), Claude
plugin only, or Both. A Claude plugin may bundle several explicitly selected
skills. Add Gemini as a separate compatibility target whose import and runtime
requirements must be verified before support is advertised.

This replaces the supplied dual-export draft. It preserves its intended scope
while correcting the platform claims and recording implementation gaps.

Research follow-up: [Claude and Gemini platform research, November 3, 2026](skills-platform-research-2026-11-03.md).
Google now explicitly documents Gemini App imports from `SKILL.md`, folders and
ZIP files; target-specific acceptance remains untested. Treat Gemini App,
Workspace Studio, Google Cloud Gemini Enterprise and Gemini CLI as separate
compatibility profiles. The research also records Anthropic's November 4
publishing-policy change and conflicting GitHub auto-sync documentation.

## Verified platform context

Anthropic supports standalone skills as well as plugins. Its documentation
describes plugin bundles for Enterprise group provisioning, and separately
describes sharing standalone skills with groups when settings and permissions
permit. Do not claim plugins are the only possible group-sharing path, or that
standalone skills are being removed.

Google documents a transition from Gems to skills using the open Markdown-based
`SKILL.md` format. Personal-account transition begins in November 2026. Workspace
business/enterprise retirement is no sooner than March 1, 2027; education is no
sooner than June 1, 2027. These announcements do not establish that Gemini accepts
Claude plugin manifests, SkillJetty's `.skill` archive extension, or all portable
skill scripts and dependencies.

Sources checked November 3, 2026:

- [Anthropic organization skill management](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)
- [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude marketplace structure](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude organization plugin management](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization)
- [Google personal-account Gems notice](https://support.google.com/gemini/answer/15146780?hl=en)
- [Google Workspace transition guide](https://knowledge.workspace.google.com/admin/generative-ai/gemini-app/about-the-transition-to-skills)
- [Portable Agent Skills specification](https://agentskills.io/specification)

## Output contract

Portable-only export retains its existing locations, versioning, archive layout,
review behavior, and local operation without a configured repository.

Claude plugin output uses this canonical layout:

```text
<plugin-root>/
  .claude-plugin/
    plugin.json
  skills/
    <skill-name-a>/
      SKILL.md
      ...supporting files...
    <skill-name-b>/
      SKILL.md
      ...supporting files...
```

SkillJetty requires a manifest for its own exports. Current Claude Code can
discover standard-layout plugins without one; when a manifest is supplied,
`name` is its required field. Example:

```json
{
  "name": "example-team-skills",
  "description": "Skills for the example team",
  "version": "1.0.0",
  "author": { "name": "DAF-TECH" },
  "repository": "https://github.com/example/team-skills",
  "license": "MIT"
}
```

The author is an object, not a string. Populate optional metadata only when
known and confirmed. Do not assume Git commit identity is the desired public
author; the current candidate uses a SkillJetty bot identity. Do not invent a
license grant. Let the user choose author, repository and licensing metadata.

Use kebab-case for plugin and skill identifiers. Preserve every supporting
filename, directory name, and file byte, including `SKILL.md` capitalization.
Copy captured skill snapshots; never move the author's source or rewrite paths.
Preserve empty directories in the archive and inventory, while explaining that
Git cannot represent empty directories in the exploded source tree.

The ZIP contains `.claude-plugin/` and `skills/` directly at its root. Record its
digest and verify extraction produces the same inventory. The exported plugin
must not depend on files outside its root. Retain existing path, link, identity,
size, decompression and credential-URL protections. Do not execute imported
scripts automatically.

Only skill content and the plugin manifest are generated. Do not generate
plugin-root commands, agents, hooks, MCP/LSP configuration or placeholders.
Supporting folders already inside an individual skill remain unchanged.

## Workflow

Start, Edit and existing skill Sanity checks retain their current behavior.
Submit adds Portable skill only, Claude plugin only, and Both. Selecting a plugin
also requires an explicit bundle name, description, version and selected skills;
never infer which skills belong together.

Capture each selected skill once, validate that snapshot, and derive all selected
artifacts from those same bytes. Support an explicit version for every member
even when Plugin only does not emit a portable archive. Reject duplicate skill
identifiers and case-insensitive path collisions before writing outputs.

Plugin versions form an independent lane. Record member name/version pairs,
per-file hashes, source provenance, package digest, and changelog digest in the
plugin release receipt. Versions alone do not establish exact content because
the existing workflow supports explicit replacement with recovery evidence.

Generate plugin CHANGELOG.md and release.json alongside the archive and source.
Define a versioned plugin receipt schema rather than passing it through the
existing skill-only verifier.

Done shows each artifact's local path, source snapshot, version, digest and
applicable PR link. Distinguish prepared locally, uploaded for review, merged,
and installed. A plugin export is not organization deployment.

## Repository and review integration

Proposed plugin release location relative to the configured repository:

```text
Plugins/<plugin-name>/<plugin-version>/
  source/.claude-plugin/plugin.json
  source/skills/<skill-name>/...
  <plugin-name>-<plugin-version>.zip
  CHANGELOG.md
  release.json
```

Preserve the existing portable destination. The current README illustrates a
`Skills/` prefix, but `src/repository-publisher.ts` constructs
`<skill-name>/<version>` relative to the repository. Resolve this documentation
discrepancy without silently relocating existing portable releases.

Reuse exact-commit verification, review rules and SHA-lease cleanup protections.
The publisher currently requires a verified skill release and `.skill` package;
its types, branch/path construction, receipts and PR links need explicit plugin
support. This is more than substituting file paths.

For Both, prefer one review branch/PR containing both outputs when they share a
destination repository. Its description lists the plugin version and every
member skill version. Prepare and verify all requested local artifacts before
starting remote publication. Retain complete outputs and actionable receipts
on failures; retries must not duplicate releases or overwrite unrelated work.
Never report a partial result as a successful Both export. If separate remote
submissions become necessary, specify and test their recovery behavior first.

## Marketplace handoff

A plugin directory or ZIP is not a complete GitHub marketplace. Marketplace
discovery requires a separate `.claude-plugin/marketplace.json` catalog with an
entry pointing to the plugin root, for example
`./Plugins/example-team-skills/1.0.0/source`.

Provide a documented example entry for the human to add to their marketplace.
Creating/updating the live catalog, connecting repositories, syncing, offering
plugins and assigning groups remain manual and outside this feature.

Current organization GitHub marketplace sync requires a private or internal
marketplace repository on github.com; public repositories are not accepted as
that connected marketplace. Recheck platform restrictions before deployment.

## Gemini compatibility target

Keep Gemini separate from the Claude plugin export option. Until the following
checks pass, describe Gemini as a planned target, not a supported export:

1. Verify official Gemini app and Workspace import instructions separately,
   including accepted archive extensions, nesting, limits and metadata.
2. Test a representative portable skill and supporting assets with an eligible
   account on each claimed surface. Record account type and observed results.
3. Establish supported scripts, dependencies, file access and invocation behavior;
   distinguish successful import from successful execution.
4. Check sharing, permissions, updates and knowledge-file handling for each
   claimed workflow. Do not infer organization deployment from personal import.
5. Determine whether the existing portable artifact suffices. Add a Google-specific
   package adapter only if documented requirements demand one. Any required
   transformation must be explicit and must preserve the canonical source.

Do not add a selectable Gemini export that implies working compatibility before
these checks are complete. No Claude manifest is presumed usable by Gemini.

## Acceptance criteria

- Portable-only behavior, paths, versioning and review remain unchanged.
- Single- and multi-skill plugin outputs validate with
  `claude plugin validate <plugin-root>` against a recorded supported CLI version.
- A separate `claude --plugin-dir <plugin-root>` smoke test confirms discovery
  and invocation. Record observed namespacing and bundled cross-skill references.
- Source and extracted archive inventories match each member's captured snapshot
  by relative path and byte hash. No supporting content is rewritten.
- Representative scripts are tested after relocation where execution is supported.
  A script deriving its root from `__file__` is one test case, not general proof.
- Duplicate identities, unsafe paths, changed snapshots and partial failures
  fail clearly and preserve recoverable work.
- Plugin receipts and notes identify exact member content and independent bundle
  version. Both uses the same member snapshots for all emitted artifacts.
- Review links, exact-commit checks, merge and cleanup work for plugin submissions.
- Gemini claims are limited to the surfaces and workflows actually verified.

All implementation and testing must follow the managed workbench boundary and
owner working-area policy. Publication and release decisions remain separate.
