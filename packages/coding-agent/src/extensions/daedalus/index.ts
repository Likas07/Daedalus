// Safety extensions
export { default as permissionGate } from "./safety/permission-gate.js";
export { default as protectedPaths } from "./safety/protected-paths.js";
export { default as confirmDestructive } from "./safety/confirm-destructive.js";
export { default as dirtyRepoGuard } from "./safety/dirty-repo-guard.js";

// Tool extensions
export { default as todo } from "./tools/todo.js";
export { default as question } from "./tools/question.js";
export { default as questionnaire } from "./tools/questionnaire.js";
export { default as dynamicTools } from "./tools/dynamic-tools.js";
export { default as truncatedTool } from "./tools/truncated-tool.js";
export { default as tools } from "./tools/tools.js";
export { default as ssh } from "./tools/ssh.js";

// Workflow extensions
export { default as qna } from "./workflow/qna.js";
export { default as handoff } from "./workflow/handoff.js";
export { default as planMode } from "./workflow/plan-mode/index.js";
export { default as intentCollect } from "./workflow/intent-collect.js";
export { default as intentReview } from "./workflow/intent-review.js";

// UI extensions
export { default as statusLine } from "./ui/status-line.js";
export { default as modalEditor } from "./ui/modal-editor.js";
export { default as notify } from "./ui/notify.js";

// Terminal extensions
export { default as interactiveShell } from "./terminal/interactive-shell.js";
export { default as fileTrigger } from "./terminal/file-trigger.js";

// Resource extensions
export { default as dynamicResources } from "./resources/dynamic-resources.js";
