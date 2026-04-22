import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import dynamicResources from "./resources/dynamic-resources.js";
import confirmDestructive from "./safety/confirm-destructive.js";
import dirtyRepoGuard from "./safety/dirty-repo-guard.js";
import permissionGate from "./safety/permission-gate.js";
import protectedPaths from "./safety/protected-paths.js";
import dynamicTools from "./tools/dynamic-tools.js";
import fsSearch from "./tools/fs-search.js";
import question from "./tools/question.js";
import questionnaire from "./tools/questionnaire.js";
import readAgentResultOutput from "./tools/read-agent-result-output.js";
import semSearch from "./tools/sem-search.js";
import semanticWorkspaceTools from "./tools/semantic-workspace-tools.js";
import skill from "./tools/skill.js";
import todo from "./tools/todo.js";
import tools from "./tools/tools.js";
import truncatedTool from "./tools/truncated-tool.js";
import statusDashboard from "./ui/status-dashboard.js";
import statusLine from "./ui/status-line.js";
import handoff from "./workflow/handoff.js";
import planExecution from "./workflow/plan-execution/index.js";
import planMode from "./workflow/plan-mode/index.js";
import primaryRoleMode from "./workflow/primary-role/index.js";
import qna from "./workflow/qna.js";
import subagents from "./workflow/subagents/index.js";

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
	readAgentResultOutput(pi);
	dynamicTools(pi);
	fsSearch(pi);
	semSearch(pi);
	semanticWorkspaceTools(pi);
	truncatedTool(pi);
	tools(pi);

	skill(pi);
	statusDashboard(pi);
	qna(pi);
	handoff(pi);
	planExecution(pi);
	planMode(pi);
	primaryRoleMode(pi);
	subagents(pi);
	statusLine(pi);
	dynamicResources(pi);
}
