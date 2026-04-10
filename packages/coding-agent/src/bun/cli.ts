#!/usr/bin/env bun
process.title = "daedalus";
process.emitWarning = (() => {}) as typeof process.emitWarning;

await import("./register-bedrock.js");
await import("../cli.js");

export {};
