import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { V1Request, V1RouteHandler } from "./router";

export function createTextV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) =>
			method === "text.threadTitle" ||
			method === "text.branchName" ||
			method === "text.commitMessage" ||
			method === "text.prContent",
		handle: async (request, context) => {
			const v1Request = request as V1Request;
			const service = context.textGeneration ?? defaultTextGenerationService();
			switch (v1Request.method) {
				case "text.threadTitle":
					return service.threadTitle(v1Request.params as protocolV1.TextGenerateThreadTitleParams);
				case "text.branchName":
					return service.branchName(v1Request.params as protocolV1.TextGenerateBranchNameParams);
				case "text.commitMessage":
					return service.commitMessage(v1Request.params as protocolV1.TextGenerateCommitMessageParams);
				case "text.prContent":
					return service.prContent(v1Request.params as protocolV1.TextGeneratePrContentParams);
				default:
					throw new Error(`Unsupported text v1 method: ${v1Request.method}`);
			}
		},
	};
}

export function defaultTextGenerationService() {
	return {
		async threadTitle(params: protocolV1.TextGenerateThreadTitleParams): Promise<protocolV1.TextGenerateThreadTitleResult> {
			return { title: limit(titleCase(seedText(params)), 120) || "New Thread" };
		},
		async branchName(params: protocolV1.TextGenerateBranchNameParams): Promise<protocolV1.TextGenerateBranchNameResult> {
			return { branch: limit(slug(seedText(params)) || "daedalus-thread", 80) };
		},
		async commitMessage(
			params: protocolV1.TextGenerateCommitMessageParams,
		): Promise<protocolV1.TextGenerateCommitMessageResult> {
			const subjectSeed = titleCase(seedText(params));
			return { subject: limit(`chore: ${lowerFirst(subjectSeed || "update workspace")}`, 120) };
		},
		async prContent(params: protocolV1.TextGeneratePrContentParams): Promise<protocolV1.TextGeneratePrContentResult> {
			const title = limit(titleCase(seedText(params)), 120) || "Update Workspace";
			const tests = params.files?.length ? `Touched files: ${params.files.join(", ")}` : "Tests not run.";
			return { title, body: `## Summary\n\n- ${title}\n\n## Tests\n\n- ${tests}` };
		},
	};
}

function seedText(params: { message?: string; diff?: string; files?: readonly string[] }): string {
	return clean(params.message ?? params.diff?.split("\n").find((line) => line.trim().length > 0) ?? params.files?.[0] ?? "");
}

function clean(value: string): string {
	return value.replace(/\s+/g, " ").replace(/[^\w .:/-]/g, "").trim();
}

function titleCase(value: string): string {
	return value
		.split(/[ .:/_-]+/)
		.filter(Boolean)
		.slice(0, 10)
		.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
		.join(" ");
}

function lowerFirst(value: string): string {
	return value.slice(0, 1).toLowerCase() + value.slice(1);
}

function slug(value: string): string {
	return clean(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function limit(value: string, max: number): string {
	return value.length <= max ? value : value.slice(0, max).replace(/[-\s]+$/g, "");
}
