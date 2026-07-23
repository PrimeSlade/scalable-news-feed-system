---
name: slade-archive
description: Verify the final state of a completed or explicitly accepted Slade change and archive its artifacts in Default mode without hiding failed, blocked, or skipped work. Use after slade-apply when the user wants to close a change.
---

# Slade Archive

Work only in Default mode. Read `.agents/slade/artifact-contract.md` and inspect the change
artifacts plus the relevant code diff.

## Close the change

1. Run:

   ```sh
   node .agents/slade/validate-change.cjs sdd/changes/<change-name> --phase archive
   ```

2. Stop if tasks are active, approvals are missing, or unresolved gaps lack explicit outcome
   approval.
3. Summarize delivered scope, task outcomes, test evidence, deviations, and remaining gaps.
4. Ask for explicit archive confirmation.
5. After confirmation, set `Change status: ARCHIVED` and move the directory to
   `sdd/archive/YYYY-MM-DD/<change-name>/`.

Never convert failed, blocked, or skipped work into success. Archiving closes the record; it
does not claim perfect completion.
