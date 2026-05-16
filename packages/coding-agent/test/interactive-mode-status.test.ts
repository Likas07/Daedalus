import { type Component, Container } from "@daedalus-pi/tui";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function renderLastLine(container: Container, width = 120): string {
	const last = container.children[container.children.length - 1];
	if (!last) return "";
	return last.render(width).join("\n");
}

function renderAll(container: Container, width = 120): string {
	return container.children.flatMap((child) => child.render(width)).join("\n");
}

function createInteractiveModeForHistoryViewportTest(): InteractiveMode {
	const settingsManager = {
		getShowHardwareCursor: () => false,
		getClearOnShrink: () => true,
		getEditorPaddingX: () => 0,
		getAutocompleteMaxVisible: () => 5,
		getHideThinkingBlock: () => false,
		getTheme: () => "dark",
	};
	const session = {
		agent: {},
		sessionManager: { getCwd: () => process.cwd() },
		settingsManager,
		autoCompactionEnabled: true,
		resourceLoader: { getThemes: () => ({ themes: [], diagnostics: [] }) },
	};

	return new InteractiveMode({ session } as any);
}

describe("InteractiveMode history viewport", () => {
	test("does not enable the in-band history scrollbar by default", async () => {
		const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		try {
			const mode = createInteractiveModeForHistoryViewportTest() as any;
			const historyViewport = mode.historyViewport;
			mode.chatContainer.addChild({ render: () => ["abc"], invalidate: () => {} });

			historyViewport.setHeight(1);

			expect(historyViewport.render(3)).toEqual(["abc"]);
			expect(historyViewport.showScrollbar).toBe(false);
			await new Promise((resolve) => setTimeout(resolve, 25));
		} finally {
			stdoutWrite.mockRestore();
		}
	});
});

describe("InteractiveMode wheel scrolling", () => {
	test("scrolls history when a non-overlay custom UI replaces the editor", () => {
		const customComponent = { render: () => [], invalidate: () => {} };
		const fakeThis: any = {
			getMouseWheelScrollDelta: (InteractiveMode as any).prototype.getMouseWheelScrollDelta,
			ui: { hasOverlay: () => false, requestRender: vi.fn() },
			editor: { render: () => [], invalidate: () => {} },
			editorContainer: new Container(),
			historyViewport: { scrollBy: vi.fn() },
		};
		fakeThis.editorContainer.addChild(customComponent);

		const result = (InteractiveMode as any).prototype.handleScrollInput.call(fakeThis, "\x1b[<64;10;5M");

		expect(fakeThis.historyViewport.scrollBy).toHaveBeenCalledWith(-3);
		expect(fakeThis.ui.requestRender).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ consume: true });
	});

	test("preserves overlay behavior by not consuming wheel input while an overlay is active", () => {
		const fakeThis: any = {
			getMouseWheelScrollDelta: (InteractiveMode as any).prototype.getMouseWheelScrollDelta,
			ui: { hasOverlay: () => true, requestRender: vi.fn() },
			editor: { render: () => [], invalidate: () => {} },
			editorContainer: new Container(),
			historyViewport: { scrollBy: vi.fn() },
		};

		const result = (InteractiveMode as any).prototype.handleScrollInput.call(fakeThis, "\x1b[<64;10;5M");

		expect(fakeThis.historyViewport.scrollBy).not.toHaveBeenCalled();
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});
});

describe("InteractiveMode blocking custom UI loader lifecycle", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	function createEditor() {
		let text = "draft";
		return {
			getText: vi.fn(() => text),
			setText: vi.fn((next: string) => {
				text = next;
			}),
			render: () => [],
			invalidate: () => {},
		};
	}

	test("hides the agent Working loader while a non-overlay custom UI is open and restores it on close", async () => {
		let done: ((value: string) => void) | undefined;
		const loader = {
			stop: vi.fn(),
			start: vi.fn(),
			render: () => ["Working..."],
			invalidate: () => {},
		};
		const editor = createEditor();
		const fakeThis: any = {
			blockingCustomUiDepth: 0,
			loadingAnimation: loader,
			loadingAnimationVisible: true,
			statusContainer: new Container(),
			editorContainer: new Container(),
			editor,
			ui: {
				setFocus: vi.fn(),
				requestRender: vi.fn(),
				hideOverlay: vi.fn(),
				showOverlay: vi.fn(),
			},
			keybindings: {},
			suspendWorkingLoaderForBlockingCustomUi: (InteractiveMode as any).prototype
				.suspendWorkingLoaderForBlockingCustomUi,
			restoreWorkingLoaderAfterBlockingCustomUi: (InteractiveMode as any).prototype
				.restoreWorkingLoaderAfterBlockingCustomUi,
		};
		fakeThis.statusContainer.addChild(loader as Component);
		fakeThis.editorContainer.addChild(editor as Component);

		const promise = (InteractiveMode as any).prototype.showExtensionCustom.call(
			fakeThis,
			(_tui: unknown, _theme: unknown, _keybindings: unknown, close: (value: string) => void) => {
				done = close;
				return { render: () => ["question"], invalidate: () => {} };
			},
		);

		await Promise.resolve();
		expect(loader.stop).toHaveBeenCalledTimes(1);
		expect(fakeThis.statusContainer.children).not.toContain(loader);
		expect(fakeThis.blockingCustomUiDepth).toBe(1);

		done?.("answered");
		await expect(promise).resolves.toBe("answered");

		expect(fakeThis.statusContainer.children).toContain(loader);
		expect(loader.start).toHaveBeenCalledTimes(1);
		expect(fakeThis.blockingCustomUiDepth).toBe(0);
		expect(fakeThis.ui.setFocus).toHaveBeenLastCalledWith(editor);
	});

	test("keeps the Working loader hidden if the agent starts while non-overlay custom UI is already open", async () => {
		const fakeThis: any = {
			isInitialized: true,
			blockingCustomUiDepth: 1,
			loadingAnimation: undefined,
			loadingAnimationVisible: false,
			pendingWorkingMessage: undefined,
			defaultWorkingMessage: "Working...",
			currentWorkingMessage: "Working...",
			statusContainer: new Container(),
			pendingTools: new Map(),
			retryEscapeHandler: undefined,
			retryLoader: undefined,
			streamingComponent: undefined,
			streamingMessage: undefined,
			footer: { invalidate: vi.fn() },
			ui: { requestRender: vi.fn() },
			checkShutdownRequested: vi.fn(),
			setWorkingLoaderMessage: (InteractiveMode as any).prototype.setWorkingLoaderMessage,
		};

		await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, { type: "agent_start" });

		expect(fakeThis.loadingAnimation).toBeDefined();
		expect(fakeThis.loadingAnimationVisible).toBe(false);
		expect(fakeThis.statusContainer.children).toHaveLength(0);

		(InteractiveMode as any).prototype.restoreWorkingLoaderAfterBlockingCustomUi.call(fakeThis);

		expect(fakeThis.loadingAnimationVisible).toBe(true);
		expect(fakeThis.statusContainer.children).toContain(fakeThis.loadingAnimation);

		fakeThis.loadingAnimation.stop();
	});
});

describe("InteractiveMode.showStatus", () => {
	beforeAll(() => {
		// showStatus uses the global theme instance
		initTheme("dark");
	});

	test("coalesces immediately-sequential status messages", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
			lastStatusSpacer: undefined,
			lastStatusText: undefined,
		};

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_ONE");
		expect(fakeThis.chatContainer.children).toHaveLength(2);
		expect(renderLastLine(fakeThis.chatContainer)).toContain("STATUS_ONE");

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_TWO");
		// second status updates the previous line instead of appending
		expect(fakeThis.chatContainer.children).toHaveLength(2);
		expect(renderLastLine(fakeThis.chatContainer)).toContain("STATUS_TWO");
		expect(renderLastLine(fakeThis.chatContainer)).not.toContain("STATUS_ONE");
	});

	test("appends a new status line if something else was added in between", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
			lastStatusSpacer: undefined,
			lastStatusText: undefined,
		};

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_ONE");
		expect(fakeThis.chatContainer.children).toHaveLength(2);

		// Something else gets added to the chat in between status updates
		fakeThis.chatContainer.addChild({ render: () => ["OTHER"], invalidate: () => {} });
		expect(fakeThis.chatContainer.children).toHaveLength(3);

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_TWO");
		// adds spacer + text
		expect(fakeThis.chatContainer.children).toHaveLength(5);
		expect(renderLastLine(fakeThis.chatContainer)).toContain("STATUS_TWO");
	});
});

describe("InteractiveMode.createExtensionUIContext setTheme", () => {
	test("persists theme changes to settings manager", () => {
		initTheme("dark");

		let currentTheme = "dark";
		const settingsManager = {
			getTheme: vi.fn(() => currentTheme),
			setTheme: vi.fn((theme: string) => {
				currentTheme = theme;
			}),
		};
		const fakeThis: any = {
			session: { settingsManager },
			settingsManager,
			ui: { requestRender: vi.fn() },
		};

		const uiContext = (InteractiveMode as any).prototype.createExtensionUIContext.call(fakeThis);
		const result = uiContext.setTheme("light");

		expect(result.success).toBe(true);
		expect(settingsManager.setTheme).toHaveBeenCalledWith("light");
		expect(currentTheme).toBe("light");
		expect(fakeThis.ui.requestRender).toHaveBeenCalledTimes(1);
	});

	test("does not persist invalid theme names", () => {
		initTheme("dark");

		const settingsManager = {
			getTheme: vi.fn(() => "dark"),
			setTheme: vi.fn(),
		};
		const fakeThis: any = {
			session: { settingsManager },
			settingsManager,
			ui: { requestRender: vi.fn() },
		};

		const uiContext = (InteractiveMode as any).prototype.createExtensionUIContext.call(fakeThis);
		const result = uiContext.setTheme("__missing_theme__");

		expect(result.success).toBe(false);
		expect(settingsManager.setTheme).not.toHaveBeenCalled();
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});
});

describe("InteractiveMode.showLoadedResources", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	function createShowLoadedResourcesThis(options: {
		quietStartup: boolean;
		verbose?: boolean;
		skills?: Array<{ filePath: string }>;
		skillDiagnostics?: Array<{ type: "warning" | "error" | "collision"; message: string }>;
	}) {
		const fakeThis: any = {
			options: { verbose: options.verbose ?? false },
			chatContainer: new Container(),
			settingsManager: {
				getQuietStartup: () => options.quietStartup,
			},
			session: {
				promptTemplates: [],
				extensionRunner: undefined,
				resourceLoader: {
					getPathMetadata: () => new Map(),
					getAgentsFiles: () => ({ agentsFiles: [] }),
					getSkills: () => ({
						skills: options.skills ?? [],
						diagnostics: options.skillDiagnostics ?? [],
					}),
					getPrompts: () => ({ prompts: [], diagnostics: [] }),
					getExtensions: () => ({ extensions: [], errors: [], runtime: {} }),
					getThemes: () => ({ themes: [], diagnostics: [] }),
				},
			},
			formatDisplayPath: (p: string) => p,
			buildScopeGroups: () => [],
			formatScopeGroups: () => "resource-list",
			getShortPath: (p: string) => p,
			formatDiagnostics: () => "diagnostics",
			getBuiltInCommandConflictDiagnostics: () => [],
		};

		return fakeThis;
	}

	test("does not show verbose listing on quiet startup during reload", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: true,
			skills: [{ filePath: "/tmp/skill/SKILL.md" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			extensions: [{ path: "/tmp/ext/index.ts" }],
			force: false,
			showDiagnosticsWhenQuiet: true,
		});

		expect(fakeThis.chatContainer.children).toHaveLength(0);
	});

	test("still shows diagnostics on quiet startup when requested", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: true,
			skills: [{ filePath: "/tmp/skill/SKILL.md" }],
			skillDiagnostics: [{ type: "warning", message: "duplicate skill name" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
			showDiagnosticsWhenQuiet: true,
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[Skill conflicts]");
		expect(output).not.toContain("[Skills]");
	});
});
