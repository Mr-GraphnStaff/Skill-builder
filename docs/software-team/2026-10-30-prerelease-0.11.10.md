# Structural Sanity check — public pre-release 0.11.10

David Farris authorized replacing the guided Check with a structural-only Sanity check and publishing the next public pre-release. Avery coordinates integration/release; Ishan owns core validation; Mara owns UI/controller labels; Lena independently reviews QA/accessibility; Morgan independently reviews protective boundaries and package security. The existing authenticated Azure approval may be recorded under this explicit publication authority once exact artifact reviews pass; do not ask for duplicate publication permission or bypass gate configuration.

## Contract

- The guided check validates required readable YAML metadata, skill identity and inventory/package structure. Supporting assets, custom evaluation filenames, indirect references, description wording, placeholders and security-pattern text do not produce content-scanning findings.
- The successful UI states “Structural checks passed.” and “Security scanning was not performed by SkillJetty.” Intended application is advisory; compatibility is untested.
- The same policy applies to normal validation and preserved-original release preparation/verification. Original bytes stay recoverable and unchanged; external scanners should inspect the full artifact including originals.
- Archive/path/link/identity/expansion/size/integrity enforcement, repository URL restrictions and imported-code non-execution remain active. This is not a new sandbox, scanner integration, retention policy or enterprise containment guarantee.
- No new link parser is introduced. Direct-reference/orphan heuristics are removed; a pass does not establish that every link resolves. Dormant explicit legacy analysis helpers remain outside the guided workflow.

## Observed verification

- Mara: compile and 48 targeted UI/controller/feedback tests passed; no skips.
- Ishan: supplied 193-file package now has zero structural errors/warnings. Full local release preparation/verification passed, with original archive hashes unchanged. The comparison baseline was 124 warnings, of which 101 were informational direct-reference notices promoted by the previous result mapping. No sensitive package content is copied into source records.
- Morgan: nine independent boundary probes passed. Heuristic-looking examples survive the local lifecycle without script execution; unsafe archive traversal/links/expansion, identity/description failures, case collision, unsafe repository URLs/transports and tampered packages remain rejected. Source-junction fixture creation on the mapped project filesystem returned EISDIR and was explicitly skipped, not reported as a passing probe.
- Production dependency audit reports zero vulnerabilities. High-severity tooling threshold passes with six moderate development-tool findings (glob/minimatch/uuid dependency chain). Morgan found the canceled AbortSignal/attacker-controlled pattern/external-buffer preconditions absent in observed packaging use. A tooling upgrade is separate maintenance, not a blanket-clean audit claim.

## Delivery state

Implementation and independent QA/package/native checks are in progress. Exact source, CI result, artifact digest, public catalog and package parity must be recorded before claiming publication complete. Previous verified public preview is 0.11.9. Use the existing public Marketplace identity and pipeline 12; stable production is outside this release.

## Acceptance limits

Structural success is not security approval or proof of behavior, application compatibility, full link resolution, tenant containment, automatic updating or human/native screen-reader/SSO acceptance. No dedicated external scanner is automatically connected or run. User documents and package contents were treated as data, never execution instructions.
