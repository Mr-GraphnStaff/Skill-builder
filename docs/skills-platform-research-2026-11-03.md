# Claude organization plugins and Gemini skills: research and preparation

Research date: November 3, 2026, America/Chicago.

This research-stage report informed [the export proposal](dual-export-feature-spec.md).
Subsequent implementation and release evidence is tracked in the
[assignment ledger](software-team/2026-11-03-plugin-prerelease.md) and public wiki.
The research itself made no account-policy or deployment changes.

## Finding

The platforms are converging on reusable skill content, while retaining distinct
distribution, identity, permission and execution systems. SkillJetty should keep
portable skill source central and add explicit destination validation and export
adapters. A universal plugin package is not established by the evidence.

Anthropic is expanding organization governance around both skills and plugins;
the evidence does not show forced retirement or automatic conversion of all
standalone skills. Google explicitly plans to replace Gems with skills, with
different dates and behaviors for different account types.

Confidence is high for the published formats and announced direction, moderate
for rollout-dependent controls, and unestablished for any user's actual account.
All externally sourced findings below link to primary documentation or an
official repository. Recommendations are identified separately.

## 1. What changed, and when

Anthropic's February 24, 2026 announcement already introduced private enterprise
plugin marketplaces. The current change therefore builds on an existing plugin
ecosystem; it should not be presented as plugins first arriving in November.
[Enterprise announcement](https://claude.com/resources/articles/cowork-plugins-across-enterprise)

A more recent strategic signal is Anthropic's October 22, 2026 announcement that
Agent Skills is being donated to the Linux Foundation's Agentic AI Foundation.
It identifies maintainers from several vendors and proposes work on versioned
releases, a proposal process and security guidance. That roadmap is proposed,
not proof those specification features are already implemented.
[AAIF announcement](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation)

For SkillJetty, this supports investment in standards-based authoring and
portable provenance, with vendor wrappers kept separate from the skill itself.
This is a product recommendation, not a vendor commitment to interoperability.

## 2. Anthropic: organization distribution is broader than wrapping skills

Standalone skill provisioning remains documented. The same management article
also describes direct skill sharing with groups, subject to policy and role
permissions, alongside Enterprise plugin-based group provisioning. The old claim
that a bare skill can only reach everyone or nobody is therefore too broad.

The time-sensitive change: starting November 4, Enterprise organizations that
have scanning on and have not explicitly chosen a publishing policy may move
from review-required publishing to Open. Explicitly selected settings remain.
Recommendation: an owner who requires human approval should inspect the actual
Publishing setting before that date; this research has not changed any setting.

The article also permits group access on published inventory items, making a
rigid skill-versus-plugin permission assumption especially unsafe.
[Organization skill management](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)

Plugins are useful as a managed bundle identity: several skills can be offered,
updated and assigned together. Organization plugin marketplaces support manual
ZIP upload and repository sync. On github.com the connected organization
marketplace must be private or internal. Its supported source types are narrower
than Claude Code's. Enterprise group overrides use the most permissive result
when memberships overlap. A group's Not available value does not defeat another
group's grant. Manual uploads under the same plugin name replace the existing
version. These facts favor explicit audience review and preserved releases.

There is a documentation conflict in the GitHub sync section: one passage says
direct pushes trigger automatic sync; another says only a merged PR with a
plugin version bump triggers it and direct pushes do not. Do not promise either
behavior without testing. For a pilot, use version bumps, PR merges and verified
manual re-sync as the fallback.
[Organization plugin management](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization)

## 3. Claude formats, installation and execution

The canonical skills-only wrapper remains appropriate:

```text
plugin-root/
  .claude-plugin/plugin.json
  skills/
    skill-a/SKILL.md
    skill-a/references/...
    skill-b/SKILL.md
    skill-b/scripts/...
```

The full Claude Code reference says the manifest is optional for standard-layout
discovery; when present, its required field is `name`. `author` is an object with
its own required `name`. SkillJetty can require an explicit manifest as its
export policy. The documented validator is `claude plugin validate <root>`;
validation and warning behavior depend on the CLI version.
[Manifest reference](https://code.claude.com/docs/en/plugins-reference)

Cross-surface authoring documentation describes an explicit manifest and accepts
either plugin contents at the ZIP root or a single enclosing plugin folder.
SkillJetty should choose one canonical export shape. Keep plugin `name` stable,
and raise the bundle version on each release. Directory submission adds its own
README/license requirements; those are distinct from local plugin loading.
Run validation and a functional test separately.
[Structure and testing](https://claude.com/docs/plugins/build)

A marketplace is another layer: `.claude-plugin/marketplace.json` lists plugin
names and sources. A versioned plugin under SkillJetty's proposed `Plugins/`
tree can be referenced by a relative path ending in its `source/` directory.
An exported ZIP alone does not create or connect that catalog.
[Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces)

An official example demonstrates that skills-only bundles can also be declared
through marketplace entries listing skill directories. Anthropic's own
`document-skills` entry uses that approach. This is an alternative format, not a
reason to omit SkillJetty's explicit wrapper: the wrapper makes a self-contained
export easier to inspect and test independently.
[Official skills catalog](https://github.com/anthropics/skills/blob/main/.claude-plugin/marketplace.json)

| Claude component | Chat | Cowork | Claude Code |
| --- | --- | --- | --- |
| Skills | Loads | Loads | Loads |
| Commands | Used as skills | Loads | Loads |
| Agents and hooks | Ignored | Loads | Loads |
| Local MCP processes | Ignored | Local sessions | Loads |
| Top-level executables in `bin/` | Installation refused | Installation refused | Loads |

Account installs can reach Claude Code, while CLI-only installs do not flow back
to the account. The published account-side limits are 5,000 files and 200 MB per
plugin. Treat those as a different profile from a local CLI install.
[Platform support matrix](https://claude.com/docs/plugins/platform-support)

Claude account plugin sync to terminal sessions requires v2.1.273 or later and
Claude-account sign-in. API-key and cloud-provider sessions do not provide the
same sync path. This changes how installation acceptance must be tested.
[Use plugins](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)

The loading reference distinguishes in-place local loading from cached installed
copies. Files above a copied plugin's root do not travel with it. An unchanged
manifest version can retain a cached package despite newer commits. Persistent
runtime data belongs outside the versioned package, using the documented data
mechanism where available. Recommendation: test cached installation as well as
`--plugin-dir`, and test cross-skill references after namespacing.
[Loading and updates](https://code.claude.com/docs/en/plugins/loading)

## 4. Governance and security are separate acceptance layers

Enterprise scanning checks uploaded/edited third-party skills and plugins, but
does not cover everything: the documentation excludes MCP servers and certain
organization configurations, among other cases. A pass is not a general safety
or correctness guarantee. The dedicated scanning page describes a gradually
rolling-out privileged Allow anyway override; the broader skill-management page
says failed submissions cannot be approved. Record this as a rollout-dependent
conflict, not a guaranteed override or guaranteed permanent block.
[Scanning details](https://support.claude.com/en/articles/15927065-get-started-with-skill-and-plugin-scanning)

Claude Code separately exposes managed controls for allowed marketplaces,
sideload flags, account sync and plugin-only customization. An allowlist alone
does not block `--plugin-dir`, and restrictions on marketplace sources do not
necessarily restrict entries inside an approved marketplace. Recommendation:
capture applicable policy in acceptance evidence without attempting to bypass it.
[Claude Code organization controls](https://code.claude.com/docs/en/plugins/org)

For SkillJetty, structural Sanity checks, byte-integrity checks, vendor scanning,
human review, install success and functional acceptance should remain separate
recorded outcomes. Never rename a structural check to imply security approval.

## 5. Google: Gems really are being replaced

| Account/surface | Published milestone | Interpretation |
| --- | --- | --- |
| Personal Google accounts, adults | November 17, 2026: Gems become read-only | No use, edit or creation of Gems after this point |
| Same accounts | December 17, 2026: Gems removed | Preserve needed knowledge files before removal |
| Workspace business/enterprise | No sooner than March 1, 2027 | Separate transition window |
| Workspace education | No sooner than June 1, 2027 | Separate transition window |

The personal-account guide says automatic migration can omit unsupported file
types and drop the largest files until total content fits 100 MB. It also lists
current feature gaps including Canvas and Deep Research. Migration success must
therefore include a before/after inventory and workflow checks, not merely the
appearance of a new skill. Under-18 personal accounts have a later, unspecified
transition date.
[Personal transition guide](https://support.google.com/gemini/answer/18560919?hl=en)

The Workspace guide describes remaining Gems becoming inactive draft skills
requiring review/activation, and says Gemini-app skills and Workspace skills do
not currently sync. Its rollout schedule starts in October and completes by
mid-November. It describes broader Workspace eligibility than some other pages.
Do not apply the personal-account retirement date to Workspace tenants.
[Workspace transition guide](https://knowledge.workspace.google.com/admin/generative-ai/gemini-app/about-the-transition-to-skills)

## 6. Google has several distinct skill destinations

### Gemini App

The import guide explicitly accepts `SKILL.md`, a folder, or a ZIP with `SKILL.md`
in the main folder. It specifies a 100 MB total upload limit and says scripts
cannot make external website requests. Supported file types are restricted;
examples of unsupported files include TypeScript, SQL and nested archives.
Downloads exclude live Google Drive files and notebooks. Therefore a downloaded
ZIP may not be a complete offline copy of a skill's knowledge.

The page simultaneously describes adding live sources and says reference files
can only be supplied with upload; it also gives differing file-update paths.
Treat live-source authoring and update controls as requiring account verification.
The `.skill` extension is not explicitly established here as accepted.
[Gemini App import/manage guide](https://support.google.com/gemini/answer/17094296?hl=en)

### Workspace Studio and Gemini in Workspace

Studio documents creating reusable instructions, copying shared skills, using
them in Ask Gemini flow steps, and building through Google Docs with a manual
sync action. Sharing a skill creates a copy rather than demonstrating a centrally
updated plugin release. A skill cannot grant the underlying product a capability
it does not possess. The reviewed Studio guide does not establish the same ZIP
import path as the Gemini App.
[Workspace Studio skills](https://support.google.com/workspace-studio/answer/17307546)

Its administrator page still labels skills as Gemini Beta-only, while the
transition guide describes a broader rollout. Admins can control availability
by organizational unit or configuration group; that is not proof of per-skill
group distribution. Record edition, enrollment and observed controls separately.
[Workspace admin controls](https://knowledge.workspace.google.com/admin/studio/turn-skills-on-or-off)

### Google Cloud Gemini Enterprise

This is a separate product from a Workspace Enterprise account. Its documentation
allows Markdown or ZIP uploads and gives concrete constraints: exactly one
`SKILL.md`, up to 100 files, 100 MB compressed and uncompressed, and nesting up
to 10 levels relative to the skill root. It supports Python and Bash execution
and limits the instructions body to 500,000 characters. Creation/upload rights
also vary by edition. Do not borrow these limits for Gemini App without evidence.
[Gemini Enterprise skill format](https://docs.cloud.google.com/gemini/enterprise/docs/skills)

Its admin controls separately enable skills and sharing, with an option for
sharing without review. This is another governance model to test independently.
[Gemini Enterprise management](https://docs.cloud.google.com/gemini/enterprise/docs/manage-skills)

### Gemini CLI

The CLI supports Agent Skills and installing from repositories or local
directories, with user/workspace scope and a repository subdirectory option.
That installation route is separate from Gemini App import.
[CLI skills](https://geminicli.com/docs/cli/skills/)

The CLI's broader bundle format is an extension whose root contains
`gemini-extension.json`. It can include skills and other components and has
its own installation/update controls. This is not the Claude plugin manifest.
Do not turn a possible future CLI extension adapter into a claim that Gems are
becoming Claude-compatible plugins.
[CLI extension reference](https://geminicli.com/docs/extensions/reference/)

Google's official API-skills repository contains several vendor-specific plugin
metadata directories alongside shared skills. This is a useful concrete example
of source reuse with multiple wrappers; the repository teaches API development
and does not itself prove Gemini App package acceptance.
[Google API-skills repository](https://github.com/google-gemini/gemini-skills)

## 7. What SkillJetty should prepare

These are recommendations, not an authorization to implement during the freeze.

1. Preserve a canonical immutable snapshot per skill. The open standard's core
   is a directory with YAML-frontmatter `SKILL.md`; optional compatibility
   metadata can describe environment requirements, but experimental tool
   declarations are not universal permission enforcement.
   [Agent Skills specification](https://agentskills.io/specification)
2. Add destination profiles independently of package names: portable source,
   Claude plugin for account/organization use, Gemini App import, and separately
   evaluated CLI/Cloud targets. Each profile records documentation date, limits,
   supported file types and runtime assumptions.
3. Keep every original byte. Report unsupported content before export; do not
   silently delete files or rewrite instructions to make a destination accept
   them. If a user later chooses a reduced variant, record its differences.
4. Give bundles independent versions and member hashes. Preserve plugin names,
   record canonical skill identity separately from namespaced invocation, and
   distinguish package version from provider-assigned installation version.
5. Ship a reviewable marketplace-entry example with a Claude export. Keep live
   catalog changes and group assignment outside initial scope. A catalog may
   select one current release while older versioned bundles remain preserved.
6. Provide a compatibility report before Submit and precise receipts afterward:
   structurally valid, packaged, uploaded, merged, synced, installed, invoked and
   functionally accepted are different states.

Current local source confirms that `ReleaseManifest` represents one skill,
the ZIP writer adds a skill-name wrapper, and the publisher verifies a `.skill`
release and builds skill-specific branch/path names. A plugin adapter needs
explicit release and publication types; a Gemini ZIP may need only packaging
changes, but its accepted nesting still needs a real import test. Source points:
[release model and packaging](../src/skill-workbench.ts),
[publisher](../src/repository-publisher.ts),
[Submit summary](../src/guided-workbench-html.ts).

## 8. Preparation sequence and acceptance work

| Priority | Preparation | Evidence required before claiming support |
| --- | --- | --- |
| Immediate owner review | Inspect relevant Anthropic publishing policy before November 4 | Actual selected policy; no inferred account state |
| Before November 17 | Inventory personal Gems and linked knowledge | Supported/omitted-file comparison and workflow inventory |
| Before December 17 | Preserve files that personal migration will omit | Recoverable copies and hashes |
| First implementation candidate | Claude skills-only bundle export | Validator, ZIP inventory, namespaced invocation, cached install |
| Next compatibility pilot | Gemini App import from unchanged source | Eligible account, accepted nesting, files and actual task results |
| Separate pilots | Workspace Studio, Cloud Enterprise, CLI | Product-specific import, sharing and runtime observations |
| Before any delivery | Refresh docs and test exact artifact | Version-bound evidence and owner release decision |

Pilot fixtures should include one text-only skill; two interacting skills; nested
references; images/PDFs; an offline Python script; a network-dependent script;
an unsupported file; duplicate names; and a deliberately interrupted Both export.
Compare manual use and automatic discovery, record what actually runs, and test
updates with a version bump. Do not install organization content or alter live
policy as a side effect of research.

## 9. Unresolved questions and research limits

- Does the target Anthropic tenant expose bare-skill group access, plugin group
  provisioning, privileged scan overrides and the new publishing policy today?
- Which GitHub auto-sync trigger actually works in that tenant?
- Does Gemini App accept the existing `.skill` extension or require `.zip`, and
  which one-folder ZIP wrappers work? Documentation alone is insufficient here.
- How do bundled cross-skill references behave under Claude namespacing and
  Gemini's skill composition? Byte preservation does not resolve invocation.
- Which live Google knowledge sources survive export/import, and how are missing
  links and permissions reported?
- How do current beta, account-age and edition restrictions affect each surface?

This was public-source research plus targeted local source inspection. No native
Claude/Gemini runtime tests, authenticated tenant checks or organization changes
were performed. The Google Workspace announcement blog returned access errors;
its claims were checked through accessible Google support/admin documentation.
Source pages can change, and dates above are announced milestones, not observed
migration completion. No automated monitoring has been created.
