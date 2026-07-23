---
name: slade-apply
description: Implement an approved Slade change in Default mode, execute its agreed test plan, and track each task as successful, failed, or blocked using verified evidence. Use only after slade-propose has produced and approved all required artifacts.
---

# Slade Apply

Work only in Default mode. Read `.agents/slade/artifact-contract.md`, then inspect the four
artifacts in `sdd/changes/<change-name>/`.

## Approval gate

Before editing application code, run:

```sh
node .agents/slade/validate-change.cjs sdd/changes/<change-name> --phase apply
```

Stop on failure. Do not repair missing approvals by assuming user intent; return to
`$slade-propose`.

## Implement and verify

1. Work through one coherent task at a time.
2. Change its state from `PENDING` to `IN_PROGRESS` before implementation.
3. Preserve unrelated user changes and follow repository instructions.
4. Run linked tests and repository-required checks.
5. Record commands and actual results in `test.md`.
6. Mark a task `[x] SUCCESS` only when its agreed checks pass.
7. Mark attempted failures as `FAILED` and concrete external blockers as `BLOCKED`.

If implementation needs a material design or test-plan change, stop. Append an amendment,
reset affected approvals to `PENDING`, and return to `$slade-propose` for user agreement.

When all tasks succeed, set `Change status: COMPLETE`. If gaps remain, keep the truthful task
states and ask whether the user wants more work or explicitly accepts the gaps. Only an
explicit acceptance may set `Change status: ACCEPTED_WITH_GAPS` and
`Outcome approval: APPROVED`.

Finish by telling the user to invoke `$slade-archive <change-name>` when ready.
