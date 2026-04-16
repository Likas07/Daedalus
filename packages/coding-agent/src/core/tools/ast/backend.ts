import { createSgCliBackend } from "./sg-cli.js";
import type { AstBackend } from "./types.js";

export { createSgCliBackend } from "./sg-cli.js";
export type * from "./types.js";

export function createDefaultAstBackend(): AstBackend {
	return createSgCliBackend();
}
