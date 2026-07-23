---
name: slade-propose
description: Turn an approved Slade exploration into concise proposal, decision, task, and explicit test-design artifacts in Default mode, with separate user approvals for the proposal and test strategy. Use after slade-explore and before any implementation.
---

# Slade Propose

Work only in Default mode. If the current mode is Plan, ask the user to switch and stop. Resolve
`../../../slade/references/artifact-contract.md` relative to this `SKILL.md` and read it completely before
writing artifacts.

## Preconditions

- Require a change name and the exploration handoff.
- Require explicit design approval from the user.
- If either is missing, return to `$slade-explore`; do not infer decisions.

## Create the change

Create `slade/changes/<change-name>/` in the current repository and:

1. Write `decisions.md` from the approved exploration. Preserve options, selections,
   tradeoffs, and stable decision IDs. Record design approval.
2. Write concise `proposal.md` with problem/outcome, scope, non-goals, affected contracts,
   chosen design, tradeoffs, risks/rollout, acceptance criteria, and a Mermaid `flowchart`
   showing real or clearly proposed function-level calls and important failure branches.
3. Ask the user to review the proposal. Set proposal approval only after an explicit yes.
4. Derive test choices from acceptance criteria, risks, changed contracts, and the Mermaid
   flow. Present meaningful test-boundary options and a recommendation; let the user choose.
5. Write `test.md`. Give every test a stable ID, level, setup, action, expected result, and
   linked acceptance criterion.
6. Ask the user to approve the complete test plan. Record approval only after an explicit yes.
7. Write `tasks.md` with small, independently verifiable tasks linked to test IDs.

Never choose architecture, technology, tradeoffs, or test scope for the user. Reopen the
relevant decision when proposal or test design exposes a consequential unresolved choice.

## Handoff gate

Resolve `../../../slade/scripts/validate-change.cjs` relative to this `SKILL.md`, then run:

```sh
node <resolved-validator-path> slade/changes/<change-name> --phase propose
```

Fix artifact errors with the user. When validation passes, tell the user to invoke:

```text
$slade-apply <change-name>
```
