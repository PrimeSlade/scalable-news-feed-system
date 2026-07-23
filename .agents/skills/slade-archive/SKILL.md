---
name: slade-archive
description: Verify the final state of a completed or explicitly accepted Slade change and archive its artifacts in Default mode without hiding failed, blocked, or skipped work. Use after slade-apply when the user wants to close a change.
---

# Slade Archive

Work only in Default mode. Resolve `../../../slade/references/artifact-contract.md` relative to this
`SKILL.md` and read it completely, then inspect the change artifacts and relevant code diff in the
current repository.

## Close the change

1. Resolve `../../../slade/scripts/validate-change.cjs` relative to this `SKILL.md`, then run:

   ```sh
   node <resolved-validator-path> slade/changes/<change-name> --phase archive
   ```

2. Stop if tasks are active, approvals are missing, or unresolved gaps lack explicit outcome
   approval.
3. Summarize delivered scope, task outcomes, test evidence, deviations, and remaining gaps.
4. Ask for explicit archive confirmation.
5. After confirmation, set `Change status: ARCHIVED` and move the directory to
   `slade/archive/YYYY-MM-DD/<change-name>/`.

Never convert failed, blocked, or skipped work into success. Archiving closes the record; it
does not claim perfect completion.
