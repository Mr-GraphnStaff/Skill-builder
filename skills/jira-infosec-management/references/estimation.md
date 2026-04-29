# INFOSEC Effort Estimation

> Estimation rules for INFOSEC tickets.
> Every ticket gets an estimate. No exceptions. No zeros.

---

## Complexity Framework

| Complexity | Base Hours | Description |
|-----------|------------|-------------|
| Simple | 1-4h | Well-defined, single system |
| Medium | 5-16h | Multiple steps, some unknowns |
| Complex | 17-40h | Cross-system, dependencies |
| Epic | 40+h | Multi-phase - must break into sub-tasks |

## Overhead Modifiers (add to base)

| Factor | Additional Hours |
|--------|-----------------|
| Documentation requirements | +2-4h |
| Change control process | +2-3h |
| Testing and validation | +3-5h |
| Stakeholder coordination | +2-4h |
| Compliance/audit requirements | +4-6h |
| Unknown dependencies | +3-5h |
| Production deployment complexity | +2-3h |

## Task-Specific Baselines

| Task Type | Base Hours | Common Modifiers |
|-----------|------------|------------------|
| SSPM Integration | 6-10h | +2h new platform, +3h complex auth, +2h coordination |
| SPF/DNS Remediation | 3-5h per domain set | Scale by domain volume and registrar complexity |
| Security Assessment / SAR | 8-12h | Depends on documentation quality |
| Configuration Changes | 2-4h | Scale by scope |
| Architecture Document | 8-16h | +4h for compliance mapping, +2h per review cycle |
| Vendor Evaluation | 10-20h | +4h per vendor, +4h for framework creation |

## Rules

1. Never estimate 0 hours
2. Minimum increment: 1 hour
3. If estimate exceeds 40 hours: create sub-tasks
4. Include overhead (meetings, status updates, documentation)
5. Account for review cycles (at least 1h per review round)
6. Re-estimate when scope changes - update `customfield_12307` and recalculate remaining
