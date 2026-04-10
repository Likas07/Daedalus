#!/usr/bin/env bun
/**
 * CLI entry point for the Daedalus coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 */
process.title = "daedalus";
process.env.DAEDALUS_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

import { main } from "./main.js";

main(process.argv.slice(2));
