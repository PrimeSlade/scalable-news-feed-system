# Slade artifact contract

Store active changes in `sdd/changes/<change-name>/`. Use lowercase hyphen-case names and four
core files.

## `decisions.md`

```markdown
# Decisions: <title>

Design approval: PENDING
Proposal approval: PENDING
Test approval: PENDING
Outcome approval: PENDING

## D-001: <decision>

Status: SELECTED
Selected: <user choice>
Reason: <concise reason>

### Options considered

1. <option> -- <benefit>; <cost/risk>
2. <option> -- <benefit>; <cost/risk>
```

Approval values are `PENDING` and `APPROVED`. Record `Approved by: user` and
`Approved on: YYYY-MM-DD` near an accepted approval. Outcome approval is needed only for
`ACCEPTED_WITH_GAPS`.

## `proposal.md`

Required headings:

```markdown
# Proposal: <title>
## Problem and outcome
## Scope
## Non-goals
## Chosen design
## Function-level flow
## Tradeoffs
## Risks and rollout
## Acceptance criteria
```

Use a Mermaid `flowchart` with functions or callable units, not only broad services. Label
proposed names as proposed and show important failure branches.

## `test.md`

```markdown
# Test design: <title>

Test approval: PENDING

## Strategy
## Agreed tests

### T-001: <behavior>

- Level: unit | integration | end-to-end | contract | performance
- Covers: AC-001, TASK-001
- Setup: <fixture, mock, service, or data>
- Action: <operation>
- Expected: <observable result>
- Result: NOT_RUN

## Verification log

| Date | Command | Result | Notes |
| --- | --- | --- | --- |
```

Test results are `NOT_RUN`, `PASS`, `FAIL`, and `SKIPPED`. A skip requires a reason.

## `tasks.md`

```markdown
# Tasks: <title>

Change status: ACTIVE

- [ ] PENDING TASK-001: <work> (tests: T-001)
- [ ] PENDING TASK-002: <work> (tests: T-002, T-003)
```

Task states:

- `[ ] PENDING`
- `[ ] IN_PROGRESS`
- `[x] SUCCESS`
- `[ ] FAILED`
- `[ ] BLOCKED`

Change status values are `ACTIVE`, `COMPLETE`, `ACCEPTED_WITH_GAPS`, and `ARCHIVED`.
