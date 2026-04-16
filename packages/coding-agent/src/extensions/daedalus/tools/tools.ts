import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@daedalus-pi/coding-agent";
import { getSettingsListTheme } from "@daedalus-pi/coding-agent";
import { logToolDebug } from "../../../core/tool-debug.js";
import { Container, type SettingItem, SettingsList } from "@daedalus-pi/tui";
import { requireUI } from "../shared/ui.js";

interface ToolsState {
	enabledTools: string[];
}

export function migrateLegacyEnabledTools(toolNames: readonly string[]): string[] {
	const migratedTools: string[] = [];
	const seen = new Set<string>();

	for (const name of toolNames) {
		const nextName = name === "edit" ? "hashline_edit" : name;
		if (seen.has(nextName)) {
			continue;
		}
		seen.add(nextName);
		migratedTools.push(nextName);
	}

	return migratedTools;
}

export default function toolsExtension(pi: ExtensionAPI) {
	let enabledTools: Set<string> = new Set();
	let allTools: ToolInfo[] = [];

	function persistState() {
		pi.appendEntry<ToolsState>("tools-config", {
			enabledTools: Array.from(enabledTools),
		});
	}

	function applyTools() {
		pi.setActiveTools(Array.from(enabledTools));
	}

	function restoreFromBranch(ctx: ExtensionContext) {
		allTools = pi.getAllTools();
		const branchEntries = ctx.sessionManager.getBranch();
		let savedTools: string[] | undefined;

		for (const entry of branchEntries) {
			if (entry.type === "custom" && entry.customType === "tools-config") {
				const data = entry.data as ToolsState | undefined;
				if (data?.enabledTools) {
					savedTools = data.enabledTools;
				}
			}
		}

		if (savedTools) {
			const migratedTools = migrateLegacyEnabledTools(savedTools);
			const didMigrate =
				migratedTools.length !== savedTools.length || migratedTools.some((tool, index) => tool !== savedTools[index]);
			const allToolNames = new Set(allTools.map((t) => t.name));
			enabledTools = new Set(migratedTools.filter((tool) => allToolNames.has(tool)));
			logToolDebug("daedalus/tools.restoreFromBranch", "restoring saved tool state", {
				requested: migratedTools,
				details: {
					savedTools,
					migratedTools,
					didMigrate,
					filteredEnabledTools: Array.from(enabledTools),
				},
			});
			applyTools();
			if (didMigrate) {
				persistState();
			}
		} else {
			logToolDebug("daedalus/tools.restoreFromBranch", "no saved tool state; snapshot current active tools", {
				requested: pi.getActiveTools(),
			});
			enabledTools = new Set(pi.getActiveTools());
		}
	}

	pi.registerCommand("tools", {
		description: "Enable/disable tools",
		handler: async (_args, ctx) => {
			if (!requireUI(ctx, "/tools")) {
				return;
			}

			allTools = pi.getAllTools();

			await ctx.ui.custom((tui, theme, _kb, done) => {
				const items: SettingItem[] = allTools.map((tool) => ({
					id: tool.name,
					label: tool.name,
					currentValue: enabledTools.has(tool.name) ? "enabled" : "disabled",
					values: ["enabled", "disabled"],
				}));

				const container = new Container();
				container.addChild(
					new (class {
						render(_width: number) {
							return [theme.fg("accent", theme.bold("Tool Configuration")), ""];
						}
						invalidate() {}
					})(),
				);

				const settingsList = new SettingsList(
					items,
					Math.min(items.length + 2, 15),
					getSettingsListTheme(),
					(id, newValue) => {
						if (newValue === "enabled") {
							enabledTools.add(id);
						} else {
							enabledTools.delete(id);
						}
						applyTools();
						persistState();
					},
					() => {
						done(undefined);
					},
				);

				container.addChild(settingsList);

				const component = {
					render(width: number) {
						return container.render(width);
					},
					invalidate() {
						container.invalidate();
					},
					handleInput(data: string) {
						settingsList.handleInput?.(data);
						tui.requestRender();
					},
				};

				return component;
			});
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});
}
