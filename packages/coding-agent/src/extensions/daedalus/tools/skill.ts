import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { skillToolDefinition } from "../../../core/tools/skill.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(skillToolDefinition);
}
