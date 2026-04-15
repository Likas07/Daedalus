import type { AstBackend } from "./types.js";
import { createSgCliBackend } from "./sg-cli.js";

export { createSgCliBackend } from "./sg-cli.js";
export type * from "./types.js";

export function createDefaultAstBackend(): AstBackend {
	return createSgCliBackend();
}
