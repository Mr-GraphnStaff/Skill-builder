# Downloadable beta/UAT builds

`azure-pipelines-beta.yml` runs only for `codex/human-workbench-beta`. It uses
Ubuntu 24.04 and Node 22, the locked dependency tree, full tests, production audit,
and the high-severity build-tool audit. The artifact `skilljetty-beta-uat-vsix`
contains the separate local-UAT VSIX and `beta-release.json` with its exact SHA-256,
source commit, branch, build ID, beta identity and pre-release flag.

Download this artifact for intentional local UAT. It must identify as
`DavidFarris.skill-builder-beta` and coexist with production
`DavidFarris.skill-builder`. The verifier rejects production identity, missing or
false pre-release metadata, mismatched XML/package identity, altered package bytes,
and unintended pipeline/development/user-state files. Builds never install it.

This pipeline has no Marketplace task, credential, deployment environment, promotion
or publishing command. The stable pipeline's packager also rejects beta identity.
Publication under the existing public identity remains a separate reviewed
promotion after UAT acceptance. A CI package does not establish native VS Code,
accessibility, human UAT or public release acceptance.

The source snapshot was prepared from the existing beta work while preserving the
original dirty UAT checkout and protected production checkout. Pipeline tooling
uses the same pinned `@vscode/vsce` 3.9.2 and compatible Azure Identity 4.13.0
override as production delivery. See `docs/delivery.md` for the documented
development-tool advisory limits; audits run afresh for every build.
