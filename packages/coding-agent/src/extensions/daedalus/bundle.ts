import type { ExtensionAPI } from "@daedalus-pi/coding-agent";

import permissionGate from "./safety/permission-gate.js";
import protectedPaths from "./safety/protected-paths.js";
import confirmDestructive from "./safety/confirm-destructive.js";
import dirtyRepoGuard from "./safety/dirty-repo-guard.js";
import todo from "./tools/todo.js";
import question from "./tools/question.js";
import questionnaire from "./tools/questionnaire.js";
import dynamicTools from "./tools/dynamic-tools.js";
import truncatedTool from "./tools/truncated-tool.js";
import tools from "./tools/tools.js";
import qna from "./workflow/qna.js";
import handoff from "./workflow/handoff.js";
import planMode from "./workflow/plan-mode/index.js";
import intentCollect from "./workflow/intent-collect.js";
import intentReview from "./workflow/intent-review.js";
import statusLine from "./ui/status-line.js";
import dynamicResources from "./resources/dynamic-resources.js";

// Excluded from default bundle (environment-sensitive or strongly opinionated):
//   ssh, interactive-shell, file-trigger, modal-editor, notify

export default function daedalusBundle(pi: ExtensionAPI) {
	permissionGate(pi);
	protectedPaths(pi);
	confirmDestructive(pi);
	dirtyRepoGuard(pi);
	todo(pi);
	question(pi);
	questionnaire(pi);
	dynamicTools(pi);
	truncatedTool(pi);
	tools(pi);
	qna(pi);
	handoff(pi);
	planMode(pi);
	intentCollect(pi);
	intentReview(pi);
	statusLine(pi);
	dynamicResources(pi);
}
