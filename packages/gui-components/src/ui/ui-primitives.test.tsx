import { describe, expect, test } from "bun:test";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";

describe("Daedalus UI primitives", () => {
	test("Button renders tone, class, text, aria label, and disabled state", () => {
		const markup = renderMarkup(
			React.createElement(
				Button,
				{ ariaLabel: "Save changes", disabled: true, testId: "save-button", tone: "primary" },
				"Save",
			),
		);

		expectMarkupContains(markup, [
			'class="daedalus-button daedalus-button-primary daedalus-button-md"',
			'data-tone="primary"',
			'data-testid="save-button"',
			'aria-label="Save changes"',
			"disabled",
			">Save</button>",
		]);
	});

	test("Badge renders compact tone classes and accessible labels", () => {
		const markup = renderMarkup(
			React.createElement(Badge, { ariaLabel: "Two pending approvals", tone: "warning" }, "2 pending"),
		);

		expectMarkupContains(markup, [
			'class="daedalus-badge daedalus-badge-warning"',
			'data-tone="warning"',
			'aria-label="Two pending approvals"',
			"2 pending",
		]);
	});

	test("Icon renders inline SVG with named classes and aria labels", () => {
		const markup = renderMarkup(
			React.createElement(Icon, { label: "Open terminal", name: "terminal", tone: "muted" }),
		);
		const decorativeMarkup = renderMarkup(React.createElement(Icon, { name: "spark" }));

		expectMarkupContains(markup, [
			"<svg",
			'class="daedalus-icon daedalus-icon-terminal daedalus-icon-muted"',
			'data-icon="terminal"',
			'role="img"',
			'aria-label="Open terminal"',
		]);
		expect(decorativeMarkup).toContain('aria-hidden="true"');
	});

	test("Panel renders title, eyebrow, body, tone classes, and aria label", () => {
		const markup = renderMarkup(
			React.createElement(
				Panel,
				{ ariaLabel: "Diff summary", eyebrow: "Workspace", title: "Review changes", tone: "elevated" },
				React.createElement("p", null, "Three files changed"),
			),
		);

		expectMarkupContains(markup, [
			'class="daedalus-panel daedalus-panel-elevated"',
			'data-tone="elevated"',
			'aria-label="Diff summary"',
			"Workspace",
			"Review changes",
			"Three files changed",
		]);
	});

	test("StatusPill renders role, tone, text, dot, and aria label", () => {
		const markup = renderMarkup(
			React.createElement(StatusPill, { ariaLabel: "Thread is running", tone: "running" }, "Running"),
		);

		expectMarkupContains(markup, [
			'class="daedalus-status-pill daedalus-status-pill-running"',
			'data-tone="running"',
			'role="status"',
			'aria-label="Thread is running"',
			'class="daedalus-status-pill-dot"',
			"Running",
		]);
	});
});
