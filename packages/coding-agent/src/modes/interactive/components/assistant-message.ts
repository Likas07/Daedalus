import type { AssistantMessage, GeneratedImageContent } from "@daedalus-pi/ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@daedalus-pi/tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { foldHeadTailForDisplayOnly } from "./display-truncate.js";

export interface AssistantMessageFoldingOptions {
	/** Whether long assistant text blocks are eligible for display-only folding. Defaults to false. */
	collapseLongText?: boolean;
	/** Whether eligible text should render fully. Defaults to false when collapseLongText is true. */
	expanded?: boolean;
	/** Maximum source lines to render while collapsed. Defaults to 20. */
	collapsedLineBudget?: number;
}

function formatGeneratedImageLine(content: GeneratedImageContent): string | undefined {
	if (content.fileUri) {
		const label = content.visiblePath ?? content.path ?? content.fileUri;
		return `Generated image: \u001b]8;;${content.fileUri}\u001b\\${label}\u001b]8;;\u001b\\`;
	}

	if (content.error) {
		return `Generated image failed: ${content.error}`;
	}

	return undefined;
}

function isVisibleAssistantContent(content: AssistantMessage["content"][number]): boolean {
	return (
		(content.type === "text" && Boolean(content.text.trim())) ||
		(content.type === "thinking" && Boolean(content.thinking.trim())) ||
		(content.type === "generatedImage" && Boolean(formatGeneratedImageLine(content)))
	);
}

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private hiddenThinkingLabel: string;
	private lastMessage?: AssistantMessage;
	private foldingOptions: AssistantMessageFoldingOptions;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		hiddenThinkingLabel = "Thinking...",
		foldingOptions: AssistantMessageFoldingOptions = {},
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;
		this.hiddenThinkingLabel = hiddenThinkingLabel;
		this.foldingOptions = foldingOptions;

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHiddenThinkingLabel(label: string): void {
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setFoldingOptions(options: AssistantMessageFoldingOptions): void {
		this.foldingOptions = options;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setExpanded(expanded: boolean): void {
		this.setFoldingOptions({ ...this.foldingOptions, expanded });
	}

	private getDisplayText(text: string): string {
		const trimmedText = text.trim();
		if (!this.foldingOptions.collapseLongText || this.foldingOptions.expanded) {
			return trimmedText;
		}

		return foldHeadTailForDisplayOnly(trimmedText, {
			lineBudget: this.foldingOptions.collapsedLineBudget ?? 20,
			fullContentHint: "expand or open reader/export/editor for full assistant response",
		}).text;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		// Clear content container
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(isVisibleAssistantContent);

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Render content in order
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Assistant text messages with no background - trim the text
				// Set paddingY=0 to avoid extra spacing before tool executions
				this.contentContainer.addChild(new Markdown(this.getDisplayText(content.text), 1, 0, this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				// Add spacing only when another visible assistant content block follows.
				// This avoids a superfluous blank line before separately-rendered tool execution blocks.
				const hasVisibleContentAfter = message.content.slice(i + 1).some(isVisibleAssistantContent);

				if (this.hideThinkingBlock) {
					// Show static thinking label when hidden
					this.contentContainer.addChild(
						new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				} else {
					// Thinking traces in thinkingText color, italic
					this.contentContainer.addChild(
						new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme, {
							color: (text: string) => theme.fg("thinkingText", text),
							italic: true,
						}),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				}
			} else if (content.type === "generatedImage") {
				const line = formatGeneratedImageLine(content);
				if (line) {
					this.contentContainer.addChild(new Text(line, 1, 0));
				}
			}
		}

		// Check if aborted - show after partial content
		// But only if there are no tool calls (tool execution components will show the error)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(1));
				} else {
					this.contentContainer.addChild(new Spacer(1));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}
	}
}
