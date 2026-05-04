import type { ApprovalRequestId, ProviderApprovalDecision } from "@t3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
	requestId: ApprovalRequestId;
	isResponding: boolean;
	hardBlock?: boolean;
	onRespondToApproval: (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => Promise<void>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
	requestId,
	isResponding,
	hardBlock = false,
	onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				disabled={isResponding}
				onClick={() => void onRespondToApproval(requestId, "cancel")}
			>
				Cancel turn
			</Button>
			<Button
				size="sm"
				variant="destructive-outline"
				disabled={isResponding}
				onClick={() => void onRespondToApproval(requestId, "decline")}
			>
				Decline
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={isResponding || hardBlock}
				onClick={() => void onRespondToApproval(requestId, "acceptForSession")}
			>
				Always allow this session
			</Button>
			<Button
				size="sm"
				variant="default"
				disabled={isResponding || hardBlock}
				onClick={() => void onRespondToApproval(requestId, "accept")}
			>
				Approve once
			</Button>
		</>
	);
});
