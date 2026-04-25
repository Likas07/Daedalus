export type ExtensionSurfaceKind = "inspector" | "settings" | "command" | "pane" | "background-task";
export interface RendererSafeExtensionSurface {
	readonly id: string;
	readonly extensionId: string;
	readonly kind: ExtensionSurfaceKind;
	readonly title: string;
	readonly description?: string;
}
export interface RendererSafeExtensionMetadata {
	readonly id: string;
	readonly name?: string;
	readonly version?: string;
	readonly enabled: boolean;
	readonly capabilities: readonly string[];
	readonly permissions: readonly string[];
	readonly configSchema?: unknown;
	readonly commands: readonly RendererSafeExtensionSurface[];
	readonly panes: readonly RendererSafeExtensionSurface[];
	readonly backgroundTasks: readonly RendererSafeExtensionSurface[];
	readonly errors: readonly string[];
}
export function extensionCommands(
	extensions: readonly RendererSafeExtensionMetadata[],
): RendererSafeExtensionSurface[] {
	return extensions.flatMap((extension) => extension.commands);
}
