export interface ExtensionMetadata {
	readonly id: string;
	readonly name?: string;
	readonly version?: string;
	readonly description?: string;
}

export interface ExtensionToolDescriptor {
	readonly name: string;
	readonly extensionId?: string;
	readonly active?: boolean;
	readonly description?: string;
}

export interface ExtensionErrorRecord {
	readonly extensionId?: string;
	readonly message: string;
	readonly stack?: string;
	readonly ts?: string;
}

export interface ExtensionReloadDiagnostics {
	readonly reloadedAt?: string;
	readonly warnings: readonly string[];
	readonly errors: readonly ExtensionErrorRecord[];
}

export interface ExtensionRegistrySnapshot {
	readonly extensions: readonly ExtensionMetadata[];
	readonly activeTools: readonly ExtensionToolDescriptor[];
	readonly allTools: readonly ExtensionToolDescriptor[];
	readonly errors: readonly ExtensionErrorRecord[];
	readonly reload: ExtensionReloadDiagnostics;
}

export interface ExtensionRegistryOptions {
	readonly onReload?: () => void | Promise<void>;
	readonly now?: () => Date;
}

export class ExtensionRegistry {
	private readonly extensions = new Map<string, ExtensionMetadata>();
	private readonly tools = new Map<string, ExtensionToolDescriptor>();
	private readonly errors: ExtensionErrorRecord[] = [];
	private reloadDiagnostics: ExtensionReloadDiagnostics = { warnings: [], errors: [] };

	constructor(private readonly options: ExtensionRegistryOptions = {}) {}

	registerExtension(metadata: ExtensionMetadata): void {
		this.extensions.set(metadata.id, metadata);
	}
	registerTool(tool: ExtensionToolDescriptor): void {
		this.tools.set(`${tool.extensionId ?? "core"}:${tool.name}`, tool);
	}
	recordError(error: ExtensionErrorRecord): void {
		this.errors.push(error);
	}
	listExtensions(): ExtensionMetadata[] {
		return [...this.extensions.values()];
	}
	listAllTools(): ExtensionToolDescriptor[] {
		return [...this.tools.values()];
	}
	listActiveTools(): ExtensionToolDescriptor[] {
		return this.listAllTools().filter((tool) => tool.active !== false);
	}
	listErrors(): ExtensionErrorRecord[] {
		return [...this.errors];
	}
	getReloadDiagnostics(): ExtensionReloadDiagnostics {
		return this.reloadDiagnostics;
	}
	readSnapshot(): ExtensionRegistrySnapshot {
		return {
			extensions: this.listExtensions(),
			activeTools: this.listActiveTools(),
			allTools: this.listAllTools(),
			errors: this.listErrors(),
			reload: this.reloadDiagnostics,
		};
	}

	async reload(): Promise<ExtensionReloadDiagnostics> {
		const errors: ExtensionErrorRecord[] = [];
		try {
			await this.options.onReload?.();
		} catch (error) {
			errors.push({
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				ts: this.nowIso(),
			});
		}
		this.reloadDiagnostics = { reloadedAt: this.nowIso(), warnings: [], errors };
		for (const error of errors) this.recordError(error);
		return this.reloadDiagnostics;
	}

	private nowIso(): string {
		return (this.options.now?.() ?? new Date()).toISOString();
	}
}
