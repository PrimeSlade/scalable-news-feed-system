---
name: slade-explore
description: Explore a proposed software change read-only in Plan mode, inspect the repository, and let the user choose architecture, technology, system-design tradeoffs, and boundaries through interactive selectors. Use before drafting a Slade proposal or whenever consequential design choices are unresolved.
---

# Slade Explore

Work only in Plan mode. If the current mode is not Plan, ask the user to switch and stop
before making design choices. Never edit files in this phase.

## Explore

1. Ask for the desired outcome if it is unclear.
2. Inspect relevant code, repository instructions, specs, diagrams, dependencies, and conventions
   read-only.
3. Summarize the current behavior, constraints, and unknowns.
4. Present one consequential decision at a time with an interactive selector.
5. Offer 2-3 viable options. State the main benefit, cost/risk, and a clearly labeled
   recommendation without selecting it.
6. Cover only relevant decisions: architecture boundary, ownership, contract, tech stack,
   consistency, failure behavior, compatibility, rollout, and observability.
7. Ask the user to approve the combined selections explicitly.

Do not treat silence, "looks fine," or repository conventions as approval. Do not write a
proposal, test plan, tasks, or application code.

## Handoff

End with a compact block containing:

- suggested lowercase hyphen-case change name
- problem and desired outcome
- selected decisions with stable IDs beginning at `D-001`
- rejected options and concise tradeoffs
- unresolved questions, if any
- design approval as `APPROVED` only after explicit confirmation

Then tell the user to switch to Default mode and invoke:

```text
$slade-propose <change-name>
```
