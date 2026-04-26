import { getEnvApiKey, type OAuthLoginCallbacks } from "@daedalus-pi/ai";
import { AuthStorage, ModelRegistry } from "@daedalus-pi/coding-agent";

export type ProviderAuthStatusValue = "ready" | "missing-auth" | "env-key" | "oauth" | "unavailable" | "error";
export type ProviderAuthMethod = "oauth" | "api-key" | "env" | "config";

export interface ProviderAuthStatus {
	readonly provider: string;
	readonly label?: string;
	readonly authenticated: boolean;
	readonly status: ProviderAuthStatusValue;
	readonly authMethod?: ProviderAuthMethod;
	readonly actionable: boolean;
	readonly canLogin: boolean;
	readonly canLogout: boolean;
	readonly canRelogin: boolean;
	readonly instruction?: string;
	readonly message?: string;
	readonly source?: string;
	readonly version?: string;
	readonly modelCount: number;
}

export interface ProviderAuthServiceOptions {
	readonly authStorage?: AuthStorage;
	readonly modelRegistry?: ModelRegistry;
	readonly oauthCallbacks?: Partial<OAuthLoginCallbacks>;
}

const ENV_KEY_BY_PROVIDER: Record<string, string> = {
	openai: "OPENAI_API_KEY",
	"azure-openai-responses": "AZURE_OPENAI_API_KEY",
	google: "GEMINI_API_KEY",
	groq: "GROQ_API_KEY",
	cerebras: "CEREBRAS_API_KEY",
	xai: "XAI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	"vercel-ai-gateway": "AI_GATEWAY_API_KEY",
	zai: "ZAI_API_KEY",
	mistral: "MISTRAL_API_KEY",
	minimax: "MINIMAX_API_KEY",
	"minimax-cn": "MINIMAX_CN_API_KEY",
	huggingface: "HF_TOKEN",
	opencode: "OPENCODE_API_KEY",
	"opencode-go": "OPENCODE_API_KEY",
	"kimi-coding": "KIMI_API_KEY",
	anthropic: "ANTHROPIC_API_KEY or ANTHROPIC_OAUTH_TOKEN",
};

export class ProviderAuthService {
	private readonly authStorage: AuthStorage;
	private readonly modelRegistry: ModelRegistry;
	private readonly oauthCallbacks?: Partial<OAuthLoginCallbacks>;

	constructor(options: ProviderAuthServiceOptions = {}) {
		this.authStorage = options.authStorage ?? AuthStorage.create();
		this.modelRegistry = options.modelRegistry ?? ModelRegistry.create(this.authStorage);
		this.oauthCallbacks = options.oauthCallbacks;
	}

	status(provider?: string): { providers: ProviderAuthStatus[] } {
		this.authStorage.reload();
		this.modelRegistry.refresh();
		const statuses = this.buildStatuses();
		return { providers: provider ? statuses.filter((status) => status.provider === provider) : statuses };
	}

	async login(provider: string): Promise<ProviderAuthStatus> {
		const oauthProvider = this.oauthProviders().get(provider);
		if (!oauthProvider) return this.apiKeyOnlyStatus(provider);
		try {
			await this.authStorage.login(provider, this.buildOAuthCallbacks(oauthProvider.name));
			return this.status(provider).providers[0] ?? this.errorStatus(provider, "Provider login completed, but provider is not in the model registry.");
		} catch (error) {
			return this.errorStatus(provider, error instanceof Error ? error.message : String(error));
		}
	}

	logout(provider: string): ProviderAuthStatus {
		this.authStorage.logout(provider);
		return this.status(provider).providers[0] ?? this.missingStatus(provider, 0);
	}

	private buildStatuses(): ProviderAuthStatus[] {
		const modelCounts = new Map<string, number>();
		for (const model of this.modelRegistry.getAll()) {
			const provider = model.provider ?? "unknown";
			modelCounts.set(provider, (modelCounts.get(provider) ?? 0) + 1);
		}
		for (const provider of this.authStorage.list()) if (!modelCounts.has(provider)) modelCounts.set(provider, 0);
		for (const provider of this.oauthProviders().keys()) if (!modelCounts.has(provider)) modelCounts.set(provider, 0);
		return [...modelCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([provider, count]) => this.providerStatus(provider, count));
	}

	private providerStatus(provider: string, modelCount: number): ProviderAuthStatus {
		const credential = this.authStorage.get(provider);
		const oauthProvider = this.oauthProviders().get(provider);
		const errors = this.authStorage.drainErrors();
		if (errors.length > 0) return this.errorStatus(provider, errors.map((error) => error.message).join("; "), modelCount);
		if (credential?.type === "oauth") return { ...this.base(provider, modelCount), label: oauthProvider?.name, authenticated: true, status: "oauth", authMethod: "oauth", actionable: true, canLogin: true, canLogout: true, canRelogin: true, source: "auth-storage" };
		if (credential?.type === "api_key") return { ...this.base(provider, modelCount), authenticated: true, status: "ready", authMethod: "api-key", actionable: true, canLogin: false, canLogout: true, canRelogin: false, source: "auth-storage" };
		if (getEnvApiKey(provider)) return { ...this.base(provider, modelCount), authenticated: true, status: "env-key", authMethod: "env", actionable: false, canLogin: false, canLogout: false, canRelogin: false, source: "environment", instruction: this.envInstruction(provider) };
		if (oauthProvider) return { ...this.base(provider, modelCount), label: oauthProvider.name, authenticated: false, status: "missing-auth", authMethod: "oauth", actionable: true, canLogin: true, canLogout: false, canRelogin: false, instruction: `Use Login to authenticate ${oauthProvider.name} with OAuth.` };
		return this.missingStatus(provider, modelCount);
	}

	private apiKeyOnlyStatus(provider: string): ProviderAuthStatus {
		return { ...this.missingStatus(provider, this.countModels(provider)), status: "unavailable", message: this.apiKeyInstruction(provider), instruction: this.apiKeyInstruction(provider) };
	}

	private missingStatus(provider: string, modelCount: number): ProviderAuthStatus {
		return { ...this.base(provider, modelCount), authenticated: false, status: "missing-auth", authMethod: "api-key", actionable: false, canLogin: false, canLogout: false, canRelogin: false, instruction: this.apiKeyInstruction(provider) };
	}

	private errorStatus(provider: string, message: string, modelCount = this.countModels(provider)): ProviderAuthStatus {
		return { ...this.base(provider, modelCount), authenticated: false, status: "error", actionable: false, canLogin: false, canLogout: false, canRelogin: false, message };
	}

	private base(provider: string, modelCount: number): Omit<ProviderAuthStatus, "authenticated" | "status" | "actionable" | "canLogin" | "canLogout" | "canRelogin"> {
		return { provider, modelCount };
	}

	private countModels(provider: string): number {
		return this.modelRegistry.getAll().filter((model) => model.provider === provider).length;
	}

	private oauthProviders() {
		return new Map(this.authStorage.getOAuthProviders().map((provider) => [provider.id, provider]));
	}

	private buildOAuthCallbacks(providerName: string): OAuthLoginCallbacks {
		return {
			onAuth: this.oauthCallbacks?.onAuth ?? (() => {}),
			onPrompt: this.oauthCallbacks?.onPrompt ?? (async (prompt) => { throw new Error(`${providerName} OAuth requires interactive input: ${prompt.message}`); }),
			onProgress: this.oauthCallbacks?.onProgress,
			onManualCodeInput: this.oauthCallbacks?.onManualCodeInput,
			signal: this.oauthCallbacks?.signal,
		};
	}

	private envInstruction(provider: string): string {
		return `Using ${ENV_KEY_BY_PROVIDER[provider] ?? `${provider.toUpperCase().replaceAll("-", "_")}_API_KEY`} from the environment.`;
	}

	private apiKeyInstruction(provider: string): string {
		const env = ENV_KEY_BY_PROVIDER[provider] ?? `${provider.toUpperCase().replaceAll("-", "_")}_API_KEY`;
		return `Set ${env} in the environment or add an api_key credential for provider "${provider}" in ~/.daedalus/agent/auth.json.`;
	}
}
