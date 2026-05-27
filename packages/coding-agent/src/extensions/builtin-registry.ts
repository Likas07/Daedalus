import type { ExtensionFactory } from "../core/extensions/index.js";
import daedalusBundle from "./daedalus/bundle.js";

export const DEFAULT_BUILTIN_EXTENSION_IDS = ["daedalus"] as const;
export type BuiltinExtensionId = (typeof DEFAULT_BUILTIN_EXTENSION_IDS)[number];

export interface BuiltinExtensionDefinition {
	id: BuiltinExtensionId;
	factory: ExtensionFactory;
	defaultEnabled: boolean;
}

export const BUILTIN_EXTENSIONS: Record<BuiltinExtensionId, BuiltinExtensionDefinition> = {
	daedalus: {
		id: "daedalus",
		factory: daedalusBundle,
		defaultEnabled: true,
	},
};

export function resolveBuiltinExtensionFactories(): ExtensionFactory[] {
	return Object.values(BUILTIN_EXTENSIONS).map((extension) => extension.factory);
}
