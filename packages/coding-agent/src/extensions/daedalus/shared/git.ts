import type { ExtensionAPI } from "@daedalus-pi/coding-agent";

export interface GitStatus {
	isRepo: boolean;
	isDirty: boolean;
	changedFileCount: number;
}

export async function getGitStatus(pi: ExtensionAPI): Promise<GitStatus> {
	const { stdout, code } = await pi.exec("git", ["status", "--porcelain"]);
	if (code !== 0) {
		return { isRepo: false, isDirty: false, changedFileCount: 0 };
	}

	const changedFiles = stdout.trim().split("\n").filter(Boolean);
	return {
		isRepo: true,
		isDirty: changedFiles.length > 0,
		changedFileCount: changedFiles.length,
	};
}
