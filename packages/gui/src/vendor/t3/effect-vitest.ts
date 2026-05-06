import nodeAssert from "node:assert/strict";
import { Effect } from "effect";
import { describe, expect, test, it as vitestIt } from "vitest";

const assert = Object.assign(nodeAssert, {
	lengthOf(value: { readonly length: number }, expectedLength: number, message?: string) {
		nodeAssert.equal(value.length, expectedLength, message);
	},
});

function runEffect(body: () => unknown) {
	return async () => {
		const result = body();
		if (Effect.isEffect(result)) {
			await Effect.runPromise(result as Effect.Effect<unknown, unknown, never>);
			return;
		}
		return result;
	};
}

const it: typeof vitestIt & {
	effect: (name: string, body: () => unknown, timeout?: number) => void;
	live: (name: string, body: () => unknown, timeout?: number) => void;
	layer: (layer: unknown) => (name: string, body: (scopedIt: typeof it) => void, timeout?: number) => void;
} = Object.assign(vitestIt, {
	effect: (name: string, body: () => unknown, timeout?: number) => vitestIt(name, runEffect(body), timeout),
	live: (name: string, body: () => unknown, timeout?: number) => vitestIt(name, runEffect(body), timeout),
	layer: (layer: unknown) => (name: string, body: (scopedIt: typeof it) => void, timeout?: number) => {
		const scopedIt = Object.assign(vitestIt, {
			effect: (testName: string, scopedBody: () => unknown, testTimeout?: number) =>
				vitestIt(
					testName,
					runEffect(() => {
						const result = scopedBody();
						return Effect.isEffect(result)
							? Effect.provide(
									result as Effect.Effect<unknown, unknown, never>,
									layer as Parameters<typeof Effect.provide>[1],
								)
							: result;
					}),
					testTimeout,
				),
			live: (testName: string, scopedBody: () => unknown, testTimeout?: number) =>
				scopedIt.effect(testName, scopedBody, testTimeout),
			layer: it.layer,
		}) as typeof it;
		describe(name, () => body(scopedIt), timeout);
	},
});

export { assert, describe, expect, it, test };
