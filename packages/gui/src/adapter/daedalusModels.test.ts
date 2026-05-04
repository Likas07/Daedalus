import { describe, expect, test } from "vitest";
import {
	accessModeToRuntimeMode,
	loadDaedalusT3Providers,
	mapDaedalusModelsToT3Providers,
	runtimeModeToAccessMode,
} from "./daedalusModels";

describe("daedalusModels", () => {
	test("maps Daedalus model/list and auth/status into T3 provider rows", () => {
		const providers = mapDaedalusModelsToT3Providers(
			[
				{ id: "gpt-5", label: "GPT 5", provider: "openai", available: true },
				{ id: "o4", provider: "openai", available: true },
				{ id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", available: false },
			],
			{ providers: [{ provider: "anthropic", authenticated: false }] },
		);

		expect(providers).toHaveLength(2);
		expect(providers[0]).toMatchObject({
			provider: "codex",
			displayName: "Openai",
			badgeLabel: "openai",
			enabled: true,
			installed: true,
			auth: { status: "authenticated" },
		});
		expect(providers[0]?.models.map((model) => [model.slug, model.name])).toEqual([
			["gpt-5", "GPT 5"],
			["o4", "o4"],
		]);
		expect(providers[1]).toMatchObject({
			provider: "claudeAgent",
			badgeLabel: "anthropic",
			status: "warning",
			auth: { status: "unauthenticated" },
		});
	});

	test("loads model/list and auth/status before mapping providers", async () => {
		const calls: string[] = [];
		const client = {
			request(method: string) {
				calls.push(method);
				if (method === "model/list") return Promise.resolve({ models: [{ id: "m", provider: "opencode" }] });
				if (method === "auth/status")
					return Promise.resolve({ providers: [{ provider: "opencode", status: "authenticated" }] });
				throw new Error(method);
			},
		};

		const providers = await loadDaedalusT3Providers(client as never);

		expect(calls.sort()).toEqual(["auth/status", "model/list"]);
		expect(providers[0]).toMatchObject({ provider: "opencode", auth: { status: "authenticated" } });
	});

	test("maps T3 runtime modes to Daedalus access modes", () => {
		expect(runtimeModeToAccessMode("approval-required")).toBe("supervised");
		expect(runtimeModeToAccessMode("auto-accept-edits")).toBe("auto-accept");
		expect(runtimeModeToAccessMode("full-access")).toBe("unrestricted");
		expect(accessModeToRuntimeMode("supervised")).toBe("approval-required");
		expect(accessModeToRuntimeMode("auto-accept")).toBe("auto-accept-edits");
		expect(accessModeToRuntimeMode("unrestricted")).toBe("full-access");
	});
});
