# SkillJetty — Agent Skills Studio

**SkillJetty by DAF-TECH** helps you create skills, bundle them into Claude plugins,
and share them from VS Code.

<img src="https://raw.githubusercontent.com/Mr-GraphnStaff/Skill-builder/02f32bb5282b87ef81ba4929c11dd88094403741/images/icon.png" alt="DAF-TECH" width="96" />

**Build it. Improve it. Share it.**

## Your project, in one place

Open **SkillJetty: Open Workbench** from the Command Palette, or click the SkillJetty
icon. The preview's Home shows your skills, saved builds and GitHub destination.
Your existing project stays where it is. On first use, choose a location once;
SkillJetty remembers it and manages its own files there.

The model is **Build space → Local repository ↔ Remote repository**. Build space
holds your editable work and packages. One local Git repository connects to the
remote. **Sync repository** brings remote changes into that local copy safely.
For a new managed project, the first upload prepares its default local repository
automatically; you do not have to find another folder or run a setup command.

1. **Open or create.** Choose an existing skill, **New skill**, or **New plugin**.
   A skill is reusable instructions. A plugin bundles one or more skills for Claude.
2. **Edit.** Changes save automatically. Click **Build / Share** when ready.
   SkillJetty checks the files and points out anything that needs fixing.
3. **Build and share.** Review the name and contents. With a repository connected,
   **Build & upload** creates the package and uploads it in one action.
   **Save locally** is available alongside it. Without a repository, build locally.

The result shows the actual package and GitHub links. Saving a plugin ZIP does
not install it into Claude. GitHub upload opens a pull request for review; it does
not merge automatically. SkillJetty manages version numbers and release notes.

There is no separate successful-check step to click through. Required choices
and next actions are visible. Publisher information has its own optional dialog.
You can build a skill package, plugin ZIP, both, or add a Gemini App import ZIP.

## Use your existing work

Choose a skill on Home, open it from your connected project, or import a skill file
or folder. Imported originals stay unchanged. Earlier edits and saved versions
remain recoverable. Failed checks, canceled selections and failed uploads keep
your work; the result identifies any incomplete action.

The header shows the **Workbench folder**, **Local repository** and **Remote repository**.
Choose **Connect repository** or **Change connection**, enter the GitHub address,
then choose an existing local Git copy or **Create a local copy**. Review the exact
folders and remote before connecting. Your workbench holds drafts, builds and
recovery; the separate local repository holds your shared skills and ZIPs.
Canceling or failing setup keeps the previous connection. Connecting an existing
copy does not pull or change its files. **Sync repository** explicitly downloads
updates with Git's preservation checks. Uploading is a separate action that opens
a review branch and pull request.

SkillJetty preserves nested files, binary assets and application-specific metadata.
It checks structure and file identity; it does not run imported scripts or models,
perform security scanning, or prove application compatibility. Test the result in
your intended application.

## Release and help

The guided repository connection fix is prepared for preview **0.15.6**. Check the
[public channel status](https://github.com/Mr-GraphnStaff/Skill-builder/wiki/Release-Channels)
for verified availability. Stable keeps its established interface. Both channels
use the same listing and command; switching versions does not migrate your data.
The installed build appears in the header.

[Short guide](https://github.com/Mr-GraphnStaff/Skill-builder/wiki/Getting-Started) ·
[Troubleshooting](https://github.com/Mr-GraphnStaff/Skill-builder/wiki/Troubleshooting) ·
[Plugin and review details](https://github.com/Mr-GraphnStaff/Skill-builder/wiki/Plugin-Exports-and-Archiving)

For storage and administration details, see the [folder reference](docs/workbench-folders.md).
The preview confines its own work to the selected data boundary. It does not move
or adopt unrelated folders. VS Code manages its own settings and sign-in data;
this application boundary is not an operating-system sandbox.

## Requirements and development

VS Code 1.90+. Publishing requires Git, a configured commit identity, and repository access. GitHub.com PR creation, reviewer selection and status checks use **VS Code's GitHub sign-in**. Git push access and API access are separate: SkillJetty checks API access before a fresh GitHub submission. Use **SkillJetty: Connect GitHub Account** if the signed-in account cannot access the destination. Your repository or organization may require additional authorization.

Creating a new repository still uses your signed-in **GitHub CLI** account. Entering an existing repository address does not require discovery. PR tools do not require the CLI. No model credentials, paid service, or global validator installation is required. SkillJetty does not store your GitHub token in project files.

```sh
npm install
npm test
npm run package
```

Older authoring commands remain internal for compatibility. The SkillJetty project screen is the normal entry point. Local preview builds may be newer than the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=DavidFarris.skill-builder).

MIT License. See [LICENSE](LICENSE).
