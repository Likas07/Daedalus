import type {
	SessionArchiveParams,
	SessionDeleteParams,
	SessionExportHtmlParams,
	SessionExportHtmlResult,
	SessionExportJsonlParams,
	SessionExportJsonlResult,
	SessionForkParams,
	SessionForkResult,
	SessionImportJsonlParams,
	SessionImportJsonlResult,
	SessionListParams,
	SessionListResult,
	SessionMutationResult,
	SessionRenameParams,
	SessionResumeParams,
	SessionResumeResult,
	SessionStatsParams,
	SessionStatsResult,
	SessionTreeParams,
	SessionTreeResult,
} from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export class SessionClient {
	constructor(private readonly client: AppServerClient) {}

	list(params: SessionListParams = {}): Promise<SessionListResult> {
		return this.client.request("session/list", params);
	}

	importJsonl(params: SessionImportJsonlParams): Promise<SessionImportJsonlResult> {
		return this.client.request("session/import-jsonl", params);
	}

	exportJsonl(params: SessionExportJsonlParams): Promise<SessionExportJsonlResult> {
		return this.client.request("session/export-jsonl", params);
	}

	exportHtml(params: SessionExportHtmlParams): Promise<SessionExportHtmlResult> {
		return this.client.request("session/export-html", params);
	}

	resume(params: SessionResumeParams): Promise<SessionResumeResult> {
		return this.client.request("session/resume", params);
	}

	fork(params: SessionForkParams): Promise<SessionForkResult> {
		return this.client.request("session/fork", params);
	}

	rename(params: SessionRenameParams): Promise<SessionMutationResult> {
		return this.client.request("session/rename", params);
	}

	archive(params: SessionArchiveParams): Promise<SessionMutationResult> {
		return this.client.request("session/archive", params);
	}

	delete(params: SessionDeleteParams): Promise<SessionMutationResult> {
		return this.client.request("session/delete", params);
	}

	stats(params: SessionStatsParams = {}): Promise<SessionStatsResult> {
		return this.client.request("session/stats", params);
	}

	tree(params: SessionTreeParams = {}): Promise<SessionTreeResult> {
		return this.client.request("session/tree", params);
	}
}
