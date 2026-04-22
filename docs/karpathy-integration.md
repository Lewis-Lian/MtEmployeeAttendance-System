# Karpathy Guidelines in Attendance System

Source repository: <https://github.com/forrestchang/andrej-karpathy-skills>

## What Was Integrated

1. `CLAUDE.md`
2. `skills/karpathy-guidelines/SKILL.md`
3. `.cursor/rules/karpathy-guidelines.mdc`
4. `.claude-plugin/plugin.json`
5. `.claude-plugin/marketplace.json`

## How This Applies to This Project

This project is a Flask attendance system with Excel import and report export.  
Use the four principles in day-to-day changes:

1. Think Before Coding
- Confirm file format assumptions (`.xls` vs `.xlsx`) before changing parsers.
- Clarify monthly report rules before changing attendance calculations.

2. Simplicity First
- Prefer small service-level fixes in `services/` over adding new abstraction layers.
- Keep route handlers straightforward and aligned with existing style.

3. Surgical Changes
- When fixing import logic, only touch the relevant parser/service files.
- Do not refactor unrelated models/routes in the same change.

4. Goal-Driven Execution
- Convert requests into verifiable checks:
  - "Fix import issue" -> reproduce with sample Excel -> parse successfully.
  - "Adjust report logic" -> generate CSV -> verify expected columns and values.

## Suggested Workflow

1. Define success criteria before editing code.
2. Implement the minimum change.
3. Verify with focused checks (import flow, dashboard behavior, CSV output).
4. Keep diffs tight and scoped to the requested goal.
