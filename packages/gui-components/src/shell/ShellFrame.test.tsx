import type { GuiShellState } from "@daedalus-pi/gui-core";
import { describe, test } from "bun:test";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { ShellFrame } from "./ShellFrame";
import { ThreadSidebar } from "./ThreadSidebar";

const shellState: GuiShellState = {
	activeProjectId: "project-1",
	activeThreadId: "thread-2",
	projects: [
		{ id: "project-1", name: "Daedalus", path: "/home/likas/Research/Daedalus" },
		{ id: "project-2", name: "", path: "/tmp/side-project" },
	],
	threads: [
		{ id: "thread-1", projectId: "project-1", title: "Earlier thread", updatedAt: "2026-04-29T12:00:00Z" },
		{ id: "thread-2", projectId: "project-1", title: "Build the GUI", updatedAt: "2026-04-30T12:00:00Z" },
		{ id: "thread-3", projectId: "project-2", title: "Other project", updatedAt: "2026-04-30T13:00:00Z" },
	],
};

describe("ShellFrame", () => {
	test("renders a T3-style shell with sidebar metadata and child content", () => {
		const markup = renderMarkup(
			React.createElement(
				ShellFrame,
				{
					activeThreadTitle: "T3 shell sidebar",
					connectionLabel: "Connected to local app server",
					state: shellState,
				},
				React.createElement("article", { className: "workspace-child" }, "Workspace child"),
			),
		);

		expectMarkupContains(markup, [
			'aria-label="Daedalus React GUI shell"',
			'class="daedalus-shell-frame"',
			'data-testid="thread-sidebar"',
			"Daedalus",
			"Thread workspace",
			"Connected to local app server",
			"Protocol v1",
			"2 projects",
			"3 threads",
			"2 projects · 3 threads",
			"T3 shell sidebar",
			"New thread soon",
			"Workspace child",
		]);
	});

	test("keeps the legacy state plus children props working", () => {
		const markup = renderMarkup(
			React.createElement(ShellFrame, { state: shellState }, React.createElement("p", null, "Legacy child")),
		);

		expectMarkupContains(markup, ["Connection pending", "Build the GUI", "Legacy child"]);
	});
});

describe("ThreadSidebar", () => {
	test("renders from props only with counts, active thread, status, and disabled placeholder affordance", () => {
		const markup = renderMarkup(React.createElement(ThreadSidebar, { connectionLabel: "Ready", state: shellState }));

		expectMarkupContains(markup, [
			'aria-label="Daedalus thread sidebar"',
			'aria-label="Workspace counts"',
			'aria-label="Thread navigation"',
			'aria-label="Connection status: Ready"',
			'data-testid="thread-sidebar-active-thread"',
			'data-testid="thread-sidebar-new-thread"',
			"Ready",
			"Build the GUI",
			"Daedalus",
			"2 projects",
			"3 threads",
			"disabled",
			"New thread soon",
		]);
	});
});
