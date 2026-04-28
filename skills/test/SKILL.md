---
name: test
description: we test shit
---

# test

## Purpose

Use this skill for one repeatable Claude workflow. Keep the source skill portable unless a specific Claude surface requires otherwise.

## Workflow

1. Confirm the user's target outcome and any runtime assumptions.
2. Follow the task-specific procedure for this skill.
3. Use supporting files only when they are directly relevant:
   - references/ for detailed guidance
   - scripts/ for deterministic helpers
   - assets/ for templates and static resources
4. Validate the output against the user's request before finalizing.

## Notes

- Do not hardcode secrets.
- Prefer MCP-oriented instructions for external systems.
- Keep product-specific assumptions explicit.
