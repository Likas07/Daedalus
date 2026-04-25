import type { GuiRuntime, GuiState } from "../client/runtime";

interface TerminalSummary {
	id: string;
	cwd: string;
	shell: string;
	status: string;
	nextSeq: number;
}
interface TerminalReplay {
	chunks: { seq: number; data: string }[];
	nextSeq: number;
	status: string;
}
interface TerminalWorkflowSummary extends TerminalSummary {
	replayCursor?: number;
	elapsedMs?: number;
	owner?: string;
}

export function renderTerminalPane(runtime: GuiRuntime): HTMLElement {
	const panel = document.createElement("section");
	panel.className = "panel terminal-pane";
	panel.innerHTML = `<h2>Terminal</h2>`;
	const output = document.createElement("pre");
	output.className = "terminal-output";
	output.textContent = terminalOutput(runtime.state);
	const cwd = document.createElement("input");
	cwd.placeholder = "cwd";
	cwd.value = runtime.state.projectRoot ?? "/tmp";
	const command = document.createElement("input");
	command.placeholder = "command input";
	const actions = document.createElement("div");
	actions.className = "actions";
	const open = button("Open", "primary", async () => {
		const result = (await runtime.client.request("terminal/create", { cwd: cwd.value, cols: 100, rows: 24 })) as {
			terminal: TerminalWorkflowSummary;
		};
		runtime.state.activeTerminalId = result.terminal.id;
		runtime.state.terminalCursor = 0;
	});
	const send = button("Send", "secondary", async () => {
		if (!runtime.state.activeTerminalId) return;
		await runtime.client.request("terminal/input", {
			terminalId: runtime.state.activeTerminalId,
			data: `${command.value}\n`,
		});
		command.value = "";
	});
	const replay = button("Replay", "secondary", async () => {
		if (!runtime.state.activeTerminalId) return;
		const result = (await runtime.client.request("terminal/replay", {
			terminalId: runtime.state.activeTerminalId,
			afterSeq: runtime.state.terminalCursor ?? 0,
		})) as TerminalReplay;
		appendTerminalOutput(runtime.state, result.chunks);
	});
	const interrupt = button("Interrupt", "secondary", async () => {
		if (runtime.state.activeTerminalId)
			await runtime.client.request("terminal/input", { terminalId: runtime.state.activeTerminalId, data: "\u0003" });
	});
	const detach = button("Detach", "secondary", async () => {
		if (runtime.state.activeTerminalId)
			await runtime.client.request("terminal/detach", { terminalId: runtime.state.activeTerminalId });
	});
	const kill = button("Kill", "danger", async () => {
		if (runtime.state.activeTerminalId)
			await runtime.client.request("terminal/kill", { terminalId: runtime.state.activeTerminalId });
	});
	actions.append(open, send, replay, interrupt, detach, kill);
	panel.append(cwd, command, actions, output);
	return panel;
}

export function appendTerminalOutput(state: GuiState, chunks: readonly { seq: number; data: string }[]): void {
	for (const chunk of chunks) {
		if (chunk.seq <= (state.terminalCursor ?? 0)) continue;
		state.terminalOutput += chunk.data;
		state.terminalCursor = chunk.seq;
	}
}

function terminalOutput(state: GuiState): string {
	return state.terminalOutput || "No terminal output yet.";
}

function button(label: string, className: string, onClick: () => void | Promise<void>): HTMLButtonElement {
	const element = document.createElement("button");
	element.className = `button ${className}`;
	element.textContent = label;
	element.addEventListener("click", () => void onClick());
	return element;
}
