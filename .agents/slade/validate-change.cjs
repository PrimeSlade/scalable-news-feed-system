#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const phaseIndex = args.indexOf("--phase");
const phase = phaseIndex >= 0 ? args[phaseIndex + 1] : "structure";
const positional = args.filter(
  (arg, index) => !arg.startsWith("--") && index !== phaseIndex + 1,
);
const phases = new Set(["structure", "propose", "apply", "archive"]);

if (positional.length !== 1 || !phases.has(phase)) {
  console.error(
    "Usage: validate-change.cjs <change-directory> [--phase structure|propose|apply|archive]",
  );
  process.exit(2);
}

const changeDirectory = path.resolve(positional[0]);
const required = {
  "proposal.md": [
    "## Problem and outcome",
    "## Scope",
    "## Non-goals",
    "## Chosen design",
    "## Function-level flow",
    "```mermaid",
    "## Tradeoffs",
    "## Acceptance criteria",
  ],
  "decisions.md": [
    "Design approval:",
    "Proposal approval:",
    "Test approval:",
    "Outcome approval:",
    "## D-",
  ],
  "tasks.md": ["# Tasks:", "Change status:", "TASK-", "tests: T-"],
  "test.md": ["Test approval:", "## Agreed tests", "T-", "## Verification log"],
};
const errors = [];
const contents = {};

if (!fs.existsSync(changeDirectory) || !fs.statSync(changeDirectory).isDirectory()) {
  console.error(`ERROR: change directory does not exist: ${changeDirectory}`);
  process.exit(1);
}

for (const [filename, markers] of Object.entries(required)) {
  const filePath = path.join(changeDirectory, filename);
  if (!fs.existsSync(filePath)) {
    errors.push(`missing ${filename}`);
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  contents[filename] = content;
  for (const marker of markers) {
    if (!content.includes(marker)) {
      errors.push(`${filename}: missing ${JSON.stringify(marker)}`);
    }
  }
}

const decisions = contents["decisions.md"] || "";
const tests = contents["test.md"] || "";
const tasks = contents["tasks.md"] || "";
const approvalValues = new Set(["PENDING", "APPROVED"]);
const approvals = {};

for (const label of [
  "Design approval",
  "Proposal approval",
  "Test approval",
  "Outcome approval",
]) {
  const match = decisions.match(new RegExp(`^${label}:\\s*(\\w+)\\s*$`, "m"));
  if (!match) continue;
  approvals[label] = match[1];
  if (!approvalValues.has(match[1])) {
    errors.push(`decisions.md: invalid ${label} value ${JSON.stringify(match[1])}`);
  }
}

const testApproval = tests.match(/^Test approval:\s*(\w+)\s*$/m);
if (testApproval && !approvalValues.has(testApproval[1])) {
  errors.push(`test.md: invalid Test approval value ${JSON.stringify(testApproval[1])}`);
}

if (["propose", "apply", "archive"].includes(phase)) {
  for (const label of ["Design approval", "Proposal approval", "Test approval"]) {
    if (approvals[label] !== "APPROVED") {
      errors.push(`decisions.md: ${label} is not APPROVED`);
    }
  }
  if (!testApproval || testApproval[1] !== "APPROVED") {
    errors.push("test.md: Test approval is not APPROVED");
  }
}

const statusMatch = tasks.match(/^Change status:\s*(\w+)\s*$/m);
const changeStatus = statusMatch ? statusMatch[1] : undefined;
const validStatuses = new Set([
  "ACTIVE",
  "COMPLETE",
  "ACCEPTED_WITH_GAPS",
  "ARCHIVED",
]);
if (changeStatus && !validStatuses.has(changeStatus)) {
  errors.push(`tasks.md: invalid Change status ${JSON.stringify(changeStatus)}`);
}

if (phase === "archive") {
  if (!["COMPLETE", "ACCEPTED_WITH_GAPS"].includes(changeStatus)) {
    errors.push("tasks.md: change is not ready to archive");
  }
  if (/^- \[ \] (PENDING|IN_PROGRESS) TASK-/m.test(tasks)) {
    errors.push("tasks.md: active tasks remain");
  }
  const hasGaps = /^- \[ \] (FAILED|BLOCKED) TASK-/m.test(tasks);
  if (changeStatus === "COMPLETE" && hasGaps) {
    errors.push("tasks.md: COMPLETE change contains failed or blocked tasks");
  }
  if (
    changeStatus === "ACCEPTED_WITH_GAPS" &&
    approvals["Outcome approval"] !== "APPROVED"
  ) {
    errors.push("decisions.md: Outcome approval is not APPROVED");
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`OK: valid Slade ${phase} change: ${changeDirectory}`);
