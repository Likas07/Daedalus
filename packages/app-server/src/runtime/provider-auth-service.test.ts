import { afterEach, describe, expect, test } from "bun:test";
import { AuthStorage, ModelRegistry } from "@daedalus-pi/coding-agent";
import { ProviderAuthService } from "./provider-auth-service";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
	if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
	else process.env.OPENAI_API_KEY = originalOpenAiKey;
});

function service(authStorage = AuthStorage.inMemory()) {
	return new ProviderAuthService({ authStorage, modelRegistry: ModelRegistry.inMemory(authStorage) });
}

describe("ProviderAuthService", () => {
	test("reports missing auth with exact env/config instructions", () => {
		delete process.env.OPENAI_API_KEY;
		const openai = service().status("openai").providers[0];
		expect(openai.provider).toBe("openai");
		expect(openai.authenticated).toBe(false);
		expect(openai.status).toBe("missing-auth");
		expect(openai.canLogin).toBe(false);
		expect(openai.instruction).toContain("Set OPENAI_API_KEY in the environment");
		expect(openai.instruction).toContain("~/.daedalus/agent/auth.json");
	});

	test("reports environment API-key status", () => {
		process.env.OPENAI_API_KEY = "test-key";
		const openai = service().status("openai").providers[0];
		expect(openai.status).toBe("env-key");
		expect(openai.authenticated).toBe(true);
		expect(openai.source).toBe("environment");
		expect(openai.canLogout).toBe(false);
	});

	test("environment-key providers expose complete actionable model snapshots", () => {
		process.env.OPENAI_API_KEY = "test-key";
		const openai = service().status("openai").providers[0];
		expect(openai.enabled).toBe(true);
		expect(openai.models.length).toBeGreaterThan(0);
		expect(openai.modelCount).toBe(openai.models.length);
		expect(openai.capabilities).toContain("reasoning");
		expect(openai.diagnostics).toEqual([]);
		expect(openai.updatedAt).toContain("T");
	});

	test("reports AuthStorage API key as ready and logout removes it", () => {
		delete process.env.OPENAI_API_KEY;
		const authStorage = AuthStorage.inMemory({ openai: { type: "api_key", key: "stored-key" } });
		const auth = service(authStorage);
		expect(auth.status("openai").providers[0]?.status).toBe("ready");
		expect(auth.status("openai").providers[0]?.canLogout).toBe(true);
		const afterLogout = auth.logout("openai");
		expect(afterLogout.status).toBe("missing-auth");
		expect(afterLogout.authenticated).toBe(false);
	});

	test("API-key-only login returns unavailable with setup instructions", async () => {
		delete process.env.GROQ_API_KEY;
		const result = await service().login("groq");
		expect(result.status).toBe("unavailable");
		expect(result.canLogin).toBe(false);
		expect(result.instruction).toContain("Set GROQ_API_KEY");
	});
});
