import { describe, expect, test } from "bun:test";
import { checkImportBoundarySource } from "../../../scripts/check-react-gui-import-boundaries";

describe("React GUI import boundaries", () => {
	test("allows Daedalus GUI package imports", () => {
		expect(
			checkImportBoundarySource({
				packageName: "react-gui",
				relativePath: "src/App.tsx",
				source: `import { AppServerClient } from "@daedalus-pi/app-server-client";\nimport { ShellFrame } from "@daedalus-pi/gui-components";`,
			}),
		).toEqual([]);
		expect(
			checkImportBoundarySource({
				packageName: "gui-components",
				relativePath: "src/ui/Button.tsx",
				source: `import React from "react";\nimport type { ThreadViewModel } from "@daedalus-pi/gui-core";`,
			}),
		).toEqual([]);
	});

	test("rejects quarantined T3, shell/process, filesystem, and Electron browser imports", () => {
		const violations = checkImportBoundarySource({
			packageName: "react-gui",
			relativePath: "src/bad.ts",
			source: `import "../../../third_party/t3code-upstream/src/server";\nimport { api } from "~/server/api";\nimport { spawn } from "node:child_process";\nimport { readFile } from "node:fs/promises";\nimport { ipcRenderer } from "electron";\nBun.spawn(["echo", "bad"]);\nprocess.exit(1);`,
		});
		const rules = violations.map((violation) => violation.rule);

		expect(rules).toContain("t3-quarantine");
		expect(rules).toContain("t3-runtime-provider-server");
		expect(rules).toContain("shell-process-api");
		expect(rules).toContain("browser-filesystem-api");
		expect(rules).toContain("electron-mutation-api");
	});

	test("applies the same browser import boundaries to gui-components", () => {
		const violations = checkImportBoundarySource({
			packageName: "gui-components",
			relativePath: "src/ui/bad.tsx",
			source: `import { provider } from "@/providers/agent";\nimport fs from "fs";\nimport { remote } from "@electron/remote";`,
		});
		const rules = violations.map((violation) => violation.rule);

		expect(rules).toContain("t3-runtime-provider-server");
		expect(rules).toContain("browser-filesystem-api");
		expect(rules).toContain("electron-mutation-api");
	});
});
