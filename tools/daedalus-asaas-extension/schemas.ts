import { Type } from "@daedalus-pi/ai";

export const asaasDocsQuerySchema = Type.Object({
	query: Type.String({ description: "Question or search query about the Asaas API docs." }),
	branch: Type.Optional(Type.String({ description: "Optional Asaas docs branch name." })),
	limit: Type.Optional(Type.Number({ description: "Maximum result count. Defaults to 5." })),
});

export const asaasApiGetSchema = Type.Object({
	path: Type.String({ description: "Relative Asaas API path, for example /customers." }),
	query: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()]))),
});

export const asaasApiMutateSchema = Type.Object({
	method: Type.Union([Type.Literal("POST"), Type.Literal("PUT"), Type.Literal("PATCH"), Type.Literal("DELETE")]),
	path: Type.String({ description: "Relative Asaas API path. Full URLs are rejected." }),
	body: Type.Optional(Type.Record(Type.String(), Type.Any())),
	query: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()]))),
	dryRun: Type.Optional(Type.Boolean({ description: "Defaults to true. Live calls require false plus UI confirmation." })),
	confirmationReason: Type.Optional(Type.String({ description: "Human-readable reason for the requested live mutation." })),
});
