---

description: Implement tasks from an OpenSpec change (Experimental)
---

Implement tasks from an OpenSpec change.

**Input**: Optionally specify a change name (e.g., `/opsx-apply add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Always announce: "Using change: <name>" and how to override (e.g., `/opsx-apply <other>`).

2. **Check status to understand the schema**

   ```bash
   openspec status --change "<name>" --json
   ```

   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - `planningHome`, `changeRoot`, and `actionContext`: planning scope and edit constraints
   - Which artifact contains the tasks (typically "tasks" for spec-driven, check status for others)

3. **Get apply instructions**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   This returns:
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): show message, suggest using `/opsx-continue`
   - If `state: "all_done"`: congratulate, suggest archive
   - Otherwise: proceed to implementation

   **Workspace guard:** If status JSON reports `actionContext.mode: "workspace-planning"` and `allowedEditRoots` is empty, explain that full workspace apply is not supported in this slice. Treat linked repos and folders as read-only context, ask the user to select an affected area through an explicit implementation workflow, and STOP before editing files.

4. **Read context files**

   Read every file path listed under `contextFiles` from the apply instructions output.
   The files depend on the schema being used:
   - **spec-driven**: proposal, specs, design, tasks
   - Other schemas: follow the contextFiles from CLI output

5. **Show current progress**

   Display:
   - Schema being used
   - Progress: "N/M tasks complete"
   - Remaining tasks overview
   - Dynamic instruction from CLI

6. **Implement tasks with hybrid pipelined review (loop until done or blocked)**

   Parse the tasks file into groups by their `## N` section headers
   (e.g. `## 1. Types and module scaffolding`, `## 2. Data access layer`).

   **Before processing each group pair (N, N+1), run a dependency check to
   choose execution mode:**

   ### Dependency check (runs after Group N is implemented, before its review)

   Read the design doc, tasks.md, and group descriptions to determine whether
   Group N+1 depends on Group N's output. Check each of:

   1. **File overlap** -- does any task in Group N+1 edit a file that Group N
      also edits? If yes -> DEPENDENT.
   2. **Import dependency** -- does Group N+1 import/extend a symbol (type,
      function, class, route) that Group N introduces? Inspect task
      descriptions for phrases like "add `getFeed` to feed.service.ts" (uses),
      "wire into controller" (uses), etc. If yes -> DEPENDENT.
   3. **Sequence cues** -- does tasks.md explicitly number groups in build
      order with cross-references (e.g. "uses `feedRepo.getPostsByIds` from
      2.1")? If yes -> DEPENDENT. Otherwise -> INDEPENDENT.

   Decision rule:
   - Any of checks 1, 2, 3 -> DEPENDENT -> **serial mode**
   - None match -> INDEPENDENT -> **pipeline mode**
   - When unclear -> default to **serial mode** (safe fallback)

   ### Serial mode (DEPENDENT groups)

   Group N implement -> `spec-reviewer` for Group N -> fix CRITICAL -> Group N+1 implement -> ...

   a. **Implement all tasks in Group N** (you, the main agent):
   - Show which task is being worked on
   - Make the code changes required, keep changes minimal and focused
   - Mark each task complete in the tasks file: `- [ ]` -> `- [x]`
   - Collect the list of file paths created or modified in this group

   b. **Spawn `spec-reviewer` for Group N** (same as pipeline mode step b -- see below)

   c. **Process review findings** (same as pipeline mode step c -- see below)

   d. If CRITICAL fixed, proceed to Group N+1

   ### Pipeline mode (INDEPENDENT groups)

   Run two Task tool calls in a **single message** so they execute in parallel:
   - `spec-reviewer` for Group N (read-only)
   - `spec-implementer` for Group N+1 (writes code, marks checkboxes)

   a. **Implement Group N** was already done (in the previous iteration).
   If this is the first group, implement it first, then enter the pipeline
   pattern from Group 2 onward.

   b. **Spawn both agents in one message:**

   ```
   // call 1: review current group
   subagent_type: "spec-reviewer"
   description: "Review group N"
   prompt: |
     Review these files for spec compliance: <file paths touched in Group N>.
     Delta spec: <delta spec path>
     Design doc: <design path>

   // call 2: implement next group in parallel
   subagent_type: "spec-implementer"
   description: "Implement group N+1"
   prompt: |
     Change: <name>
     Group: <N+1> -- <group heading>
     Tasks file: <tasks.md path>
     Design doc: <design.md path>
     Delta spec: <spec path>
     Tasks to implement:
     - <task line 1>
     - <task line 2>
   ```

   Tell the user they can `<Leader>+Down` into either child session to watch live.
   Use `Right`/`Left` to cycle between the two child sessions.

   c. **When both return, process findings:**

   - Show the reviewer's findings (CRITICAL / MINOR / SUGGESTION)
   - Show what the implementer touched (its returned file list)

   d. **Conflict detection:**

   Compare the implementer's "Files touched" list against the reviewer's
   "Files reviewed" list. If any file appears in both AND the reviewer
   flagged a CRITICAL on that file:
   - The parallel run may have written on top of broken code
   - Re-review the affected files with another `spec-reviewer` spawn
   - Then fix

   e. **Fix CRITICAL issues:**

   - If CRITICAL found on Group N: fix them yourself (Edit tool) before
     advancing
   - If CRITICAL found on Group N+1 (after its own review in the next
     iteration): handle then

   f. Proceed to next pair (N+1 -> review, N+2 -> implement in parallel), or
   if N+1 was the last group, review it serially and finish.

   ### Per-group implementation (both modes)

   a. **Implement all tasks in the group** (main agent in serial mode, or
   `spec-implementer` subagent in pipeline mode):
   - Show which task is being worked on
   - Make the code changes required -- keep changes minimal and focused
   - Mark each task complete in the tasks file: `- [ ]` -> `- [x]`
   - Collect the list of file paths created or modified in this group

   b. **Spawn the `spec-reviewer` subagent for the group**

   After all tasks in a group are marked complete, spawn a **`spec-reviewer`**
   subagent (defined in `.opencode/agents/spec-reviewer.md`) via the Task tool
   to audit the group's output. The `spec-reviewer` agent already has its
   review rules, output format, and read-only permissions baked in -- the
   prompt only needs the file list and spec paths:

   ```
   subagent_type: "spec-reviewer"
   description: "Review group N"
   prompt: |
     Review these files for spec compliance: <file paths touched in this group>.
     Delta spec: <delta spec path>
     Design doc: <design path>
   ```

   Tell the user they can navigate into the spawned child session with
   `<Leader>+Down` to watch the reviewer's tool calls live.

   c. **Process review findings**

   When the reviewer returns, show its findings to the user grouped by
   CRITICAL / MINOR / SUGGESTION (the `spec-reviewer` agent formats output
   this way).

   - **CRITICAL issues** (spec violations, bugs, broken tests): fix them
     yourself before proceeding to the next group. Don't let issues
     accumulate.
   - **MINOR / SUGGESTION**: note them and continue -- optionally batch-fix
     at the end of all groups.
   - **No issues**: proceed to the next group.

   d. **Announce the mode** at the start of each group pair, log a one-liner:
   - `Mode: SERIAL -- Group 2 imports from Group 1 (controller uses service exports)`
   - `Mode: PIPELINE -- Group 4 (tests) touches disjoint files from Group 3 (service)`

   **Pause if:**
   - Task is unclear -> ask for clarification
   - Implementation reveals a design issue -> suggest updating artifacts
   - Reviewer finds CRITICAL issues in serial mode -> fix before continuing
   - Parallel conflict detected (file touched by both) -> re-review, then fix
   - Error or blocker encountered -> report and wait for guidance
   - User interrupts

7. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - Review summary: how many groups reviewed, CRITICAL issues found and fixed,
     MINOR/SUGGESTION deferred
   - If all done: suggest running CI checks
     (`npm run format:check && npm run lint && npx tsc --noEmit && npm test`),
     then `/opsx-archive`
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name> (schema: <schema-name>)

### Group 1: Types and module scaffolding
Working on task 1/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 2/7: <task description>
[...implementation happening...]
✓ Task complete

Mode: SERIAL -- Group 2 imports from Group 1 (controller uses service exports)

#### Review: Group 1
Spawning `spec-reviewer` subagent... (watch live: <Leader>+Down)
CRITICAL: 0 | MINOR: 2 | SUGGESTION: 1
- MINOR: `feed.types.ts:12` -- naming nit
- SUGGESTION: add JSDoc (non-blocking)
No CRITICAL -- proceeding to next group.

### Group 2: Data access layer
Working on task 3/7: <task description>
...

### Group 4: Tests
Mode: PIPELINE -- Group 4 (tests) touches disjoint files from Group 3 (service)
[Reviewer 3 + Implementer 4 launched in parallel -- <Leader>+Down to watch either]
... Reviewer 3 findings: ...
... Implementer 4 reports files touched: feed.service.test.ts ...
No conflicts detected.
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 7/7 tasks complete ✓

### Completed This Session
- [x] Task 1
- [x] Task 2
...

### Review Summary
| Group       | Critical | Minor | Suggestion | Status        |
|-------------|----------|-------|------------|---------------|
| 1. Types    | 0        | 2     | 1          | OK            |
| 2. Data     | 1        | 0     | 0          | Fixed         |
| 3. Service  | 0        | 0     | 2          | OK            |

Run `npm run format:check && npm run lint && npx tsc --noEmit && npm test`, then `/opsx-archive`.
```

**Output On Pause (Issue Encountered)**

```
## Implementation Paused

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**Guardrails**

- Keep going through tasks until done or blocked
- Always read context files before starting (from the apply instructions output)
- If task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements - don't guess
- Use contextFiles from CLI output, don't assume specific file names
- **Spawn a `spec-reviewer` subagent after each task group completes -- this is mandatory, not optional.** Spawn it via the Task tool with `subagent_type: "spec-reviewer"`. The agent (in `.opencode/agents/spec-reviewer.md`) already has its review rules and read-only permissions baked in; the prompt only needs the file list + spec paths.
- If the reviewer finds CRITICAL issues, fix them before starting the next group. Do not let issues accumulate.
- MINOR / SUGGESTION issues may be deferred and batch-fixed at the end of the apply session.
- **Run the dependency check before each group pair to choose serial vs pipeline mode.** Do not blindly parallelize -- checks 1, 2, or 3 in the dependency check force serial mode to avoid building on broken or soon-to-be-changed code.
- **Pipeline mode spawns the `spec-implementer` subagent for the next group**, concurrent with the `spec-reviewer` subagent for the current group. Both are spawned in a single message with two Task tool calls so they run in parallel.
- **Serial mode = main agent implements everything; pipeline mode = `spec-implementer` subagent.** In both modes the reviewer is always the `spec-reviewer` subagent (read-only, `edit: deny` + `bash: deny`).
- If a pipeline pair detects file overlap between the implementer's files and the reviewer's files on a CRITICAL-flagged file, treat it as a conflict: re-review the affected files before fixing.
- Mention to the user they can `<Leader>+Down` into any spawned subagent's child session to watch its tool calls live. Use `Right`/`Left` to cycle between concurrent child sessions.

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: If implementation reveals design issues, suggest updating artifacts - not phase-locked, work fluidly
