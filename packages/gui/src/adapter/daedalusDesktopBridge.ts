import type { DesktopBridge } from "@t3tools/contracts";

export type T3DesktopBridge = DesktopBridge;

export function getDaedalusDesktopBridge(): T3DesktopBridge | null {
	return window.desktopBridge ?? null;
}
