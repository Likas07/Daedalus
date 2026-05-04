import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { DaedalusAccessMode, T3RuntimeMode } from "./daedalusModels";
import { accessModeToRuntimeMode, runtimeModeToAccessMode } from "./daedalusModels";
import { unsupported } from "./unsupportedCapabilities";

export const DAEDALUS_ACCESS_MODE_HELP: Record<T3RuntimeMode, string> = {
	"approval-required": "Supervised: Daedalus asks before risky actions and preserves hard-block safety policy.",
	"auto-accept-edits":
		"Auto-accept: Daedalus may accept safe edits automatically, while hard blocks still cannot be bypassed.",
	"full-access": "Unrestricted: Daedalus minimizes prompts but hard-block safety policy remains enforced.",
};

export async function getDaedalusRuntimeMode(client: AppServerClient): Promise<T3RuntimeMode> {
	const policy = await client.request("access/get", {});
	return accessModeToRuntimeMode(policy.policy.mode as DaedalusAccessMode);
}

export async function setDaedalusRuntimeMode(client: AppServerClient, mode: T3RuntimeMode): Promise<T3RuntimeMode> {
	const policy = await client.request("access/set", { mode: runtimeModeToAccessMode(mode) });
	return accessModeToRuntimeMode(policy.policy.mode as DaedalusAccessMode);
}

export function providerCliInstallUnsupported() {
	return unsupported("provider-cli-install");
}

export function providerBinaryPathUnsupported() {
	return unsupported("provider-binary-path");
}
