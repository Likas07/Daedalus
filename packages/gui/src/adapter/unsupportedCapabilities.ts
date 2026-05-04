export type UnsupportedCapability =
	| "remote-environments"
	| "server-exposure"
	| "terminal-restart"
	| "git-push"
	| "git-remote-mutation"
	| "git-branch-mutation"
	| "pull-request-mutation"
	| "provider-cli-install"
	| "provider-binary-path";

export interface UnsupportedCapabilityResult {
	readonly ok: false;
	readonly capability: UnsupportedCapability;
	readonly reason: string;
}

export const unsupportedCapabilityReasons: Record<UnsupportedCapability, string> = {
	"remote-environments": "Daedalus T3 GUI V1 supports trusted local app-server environments only.",
	"server-exposure": "Remote GUI exposure is deferred until Daedalus remote/headless policy is finalized.",
	"terminal-restart": "Terminal restart needs a Daedalus terminal restart protocol endpoint.",
	"git-push": "Push is deferred until Daedalus audited Git mutation policy includes remote writes.",
	"git-remote-mutation":
		"Pull/fetch remote Git mutations are deferred until Daedalus audited Git mutation policy includes remote writes.",
	"git-branch-mutation": "Branch mutation is deferred until Daedalus audited Git mutation policy is finalized.",
	"pull-request-mutation": "PR mutation is deferred until Daedalus integration mutation policy is finalized.",
	"provider-cli-install": "Daedalus uses native provider auth/model discovery, not T3 CLI provider installation.",
	"provider-binary-path": "Daedalus uses the app-server provider layer, not user-configured T3 CLI binary paths.",
};

export function unsupported(capability: UnsupportedCapability): UnsupportedCapabilityResult {
	return { ok: false, capability, reason: unsupportedCapabilityReasons[capability] };
}
