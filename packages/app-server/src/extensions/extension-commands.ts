import type { ExtensionRegistry, ExtensionRegistrySnapshot } from "./extension-registry";

export interface ExtensionCommandDescriptor {
	readonly id: string;
	readonly title: string;
	readonly extensionId?: string;
	run?(input?: unknown): unknown | Promise<unknown>;
}

export class ExtensionCommandRegistry {
	private readonly commands = new Map<string, ExtensionCommandDescriptor>();
	constructor(private readonly extensions?: ExtensionRegistry) {}
	register(command: ExtensionCommandDescriptor): void {
		this.commands.set(command.id, command);
	}
	list(): ExtensionCommandDescriptor[] {
		return [...this.commands.values()];
	}
	async execute(id: string, input?: unknown): Promise<unknown> {
		const command = this.commands.get(id);
		if (!command) throw new Error(`Unknown extension command: ${id}`);
		return command.run?.(input);
	}
	readExtensionSnapshot(): ExtensionRegistrySnapshot | undefined {
		return this.extensions?.readSnapshot();
	}
	async reloadExtensions(): Promise<unknown> {
		return this.extensions?.reload();
	}
}
