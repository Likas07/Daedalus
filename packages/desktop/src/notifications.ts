import { Notification } from "electron";

export type DesktopNotificationKind = "approval" | "run-completed" | "run-failed" | "provider-error";

export interface DesktopNotificationInput {
	readonly kind: DesktopNotificationKind;
	readonly title?: string;
	readonly body?: string;
}

const titles: Record<DesktopNotificationKind, string> = {
	approval: "Approval needed",
	"run-completed": "Run completed",
	"run-failed": "Run failed",
	"provider-error": "Provider error",
};

export function showDesktopNotification(input: DesktopNotificationInput): boolean {
	if (!Notification.isSupported()) return false;
	new Notification({ title: input.title ?? titles[input.kind], body: input.body }).show();
	return true;
}
