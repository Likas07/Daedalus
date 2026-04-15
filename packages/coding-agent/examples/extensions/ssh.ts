/**
 * SSH Remote Execution Example
 *
 * Re-exports the built-in Daedalus SSH extension so the example stays in sync
 * with the current remote tool support.
 *
 * Usage:
 *   pi -e ./ssh.ts --ssh user@host
 *   pi -e ./ssh.ts --ssh user@host:/remote/path
 *
 * File mutation payloads are streamed over stdin and verified after write.
 */

export { default } from "../../src/extensions/daedalus/tools/ssh.js";
