import { shouldSpillSubagentContext } from "./artifacts.js";

export interface BuiltTaskPacket {
	packetText: string;
	contextToPersist?: string;
}

export function buildTaskPacket(input: {
	goal: string;
	assignment: string;
	context?: string;
}): BuiltTaskPacket {
	const packetText = [
		`Goal: ${input.goal}`,
		"",
		input.assignment,
		input.context ? `\nContext:\n${input.context}` : "",
	].join("\n");

	if (input.context && shouldSpillSubagentContext(packetText)) {
		return {
			packetText: [`Goal: ${input.goal}`, "", input.assignment, "", "Context file: {contextArtifactPath}"].join("\n"),
			contextToPersist: input.context,
		};
	}

	return { packetText };
}
