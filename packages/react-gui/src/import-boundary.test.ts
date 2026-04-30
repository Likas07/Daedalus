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
	});

	test("rejects quarantined T3, shell/process, and Electron browser imports", () => {
		const violations = checkImportBoundarySource({
			packageName: "react-gui",
			relativePath: "src/bad.ts",
			source: `import "../../../third_party/t3code-upstream/src/server";\nimport { spawn } from "node:child_process";\nimport { ipcRenderer } from "electron";\nprocess.exit(1);`,
		});

		expect(violations.map((violation) => violation.rule)).toContain("t3-quarantine");
		expect(violations.map((violation) => violation.rule)).toContain("shell-process-api");
		expect(violations.map((violation) => violation.rule)).toContain("electron-mutation-api");
	});
});
