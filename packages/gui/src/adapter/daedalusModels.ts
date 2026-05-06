import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { AccessMode, ModelListResult } from "@daedalus-pi/app-server-protocol";
import type { ProviderKind, RuntimeMode, ServerProvider, ServerProviderAuthStatus } from "@t3tools/contracts";

export type DaedalusModelInfo = ModelListResult["models"][number] & {
	readonly authenticated?: boolean;
};

export interface DaedalusProviderAuthInfo {
	readonly provider: string;
	readonly authenticated?: boolean;
	readonly status?: string;
	readonly label?: string;
}

export interface DaedalusAuthStatusResult {
	readonly providers?: readonly DaedalusProviderAuthInfo[];
}

const providerKindByName: Record<string, ProviderKind> = {
	codex: "codex",
	openai: "codex",
	claude: "claudeAgent",
	anthropic: "claudeAgent",
	cursor: "cursor",
	opencode: "opencode",
};

function toProviderKind(provider: string | undefined): ProviderKind {
	return providerKindByName[(provider ?? "").toLowerCase()] ?? "codex";
}

function providerDisplayName(provider: string): string {
	return (
		provider
			.split(/[\s._-]+/g)
			.filter(Boolean)
			.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
			.join(" ") || provider
	);
}

function authStatusForProvider(
	provider: string,
	entries: readonly DaedalusModelInfo[],
	authStatus?: DaedalusAuthStatusResult,
): ServerProviderAuthStatus {
	const status = authStatus?.providers?.find((entry) => entry.provider === provider);
	if (status?.authenticated === true || status?.status === "authenticated") return "authenticated";
	if (status?.authenticated === false || status?.status === "missing" || status?.status === "unauthenticated")
		return "unauthenticated";
	if (entries.some((entry) => entry.authenticated === true || entry.available === true)) return "authenticated";
	if (entries.some((entry) => entry.authenticated === false || entry.available === false)) return "unauthenticated";
	return "unknown";
}

export function mapDaedalusModelsToT3Providers(
	models: readonly DaedalusModelInfo[],
	authStatus?: DaedalusAuthStatusResult,
): ServerProvider[] {
	const byProvider = new Map<string, DaedalusModelInfo[]>();
	for (const model of models) {
		const provider = model.provider ?? "daedalus";
		byProvider.set(provider, [...(byProvider.get(provider) ?? []), model]);
	}

	const now = new Date(0).toISOString();
	return [...byProvider.entries()].map(([provider, entries]) => {
		const authStatusValue = authStatusForProvider(provider, entries, authStatus);
		return {
			provider: toProviderKind(provider),
			displayName: providerDisplayName(provider),
			badgeLabel: provider,
			enabled: true,
			installed: true,
			version: null,
			status: authStatusValue === "unauthenticated" ? "warning" : "ready",
			auth: { status: authStatusValue },
			checkedAt: now,
			...(authStatusValue === "unauthenticated"
				? { message: "Sign in with Daedalus provider auth to use these models." }
				: {}),
			models: entries.map((entry) => ({
				slug: entry.id,
				name: entry.label ?? entry.id,
				shortName: entry.label ?? entry.id,
				isCustom: false,
				capabilities: null,
			})),
			skills: [],
			slashCommands: [],
		};
	});
}

export async function loadDaedalusT3Providers(client: AppServerClient): Promise<ServerProvider[]> {
	const [modelList, authStatus] = await Promise.all([
		client.request("model/list", {}),
		client.request("auth/status", {}).catch(() => undefined),
	]);
	return mapDaedalusModelsToT3Providers(modelList.models, authStatus as DaedalusAuthStatusResult | undefined);
}

export type DaedalusAccessMode = AccessMode;
export type T3RuntimeMode = RuntimeMode;

export function runtimeModeToAccessMode(mode: T3RuntimeMode): DaedalusAccessMode {
	if (mode === "approval-required") return "supervised";
	if (mode === "auto-accept-edits") return "auto-accept";
	return "unrestricted";
}

export function accessModeToRuntimeMode(mode: DaedalusAccessMode): T3RuntimeMode {
	if (mode === "supervised") return "approval-required";
	if (mode === "auto-accept") return "auto-accept-edits";
	return "full-access";
}
