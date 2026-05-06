import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type PlanMove = {
	fromMarkdown: string;
	toMarkdown: string;
	fromSidecar?: string;
	toSidecar?: string;
};

export type PlanOptions = {
	root: string;
	apply: boolean;
	fallbackDate?: string;
};

export type PlanMoveReport = {
	moves: PlanMove[];
	skipped: string[];
	errors: string[];
};

const datedPlanName = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})-(?<slug>.+)[.]md$/;
const fallbackDatePattern = /^\d{4}_\d{2}_\d{2}$/;

function sidecarPathFor(markdownPath: string): string {
	return markdownPath.replace(/[.]md$/, ".plan.json");
}

export function planLocalPlanMoves(options: PlanOptions): PlanMoveReport {
	const root = resolve(options.root);
	const plansRoot = join(root, "docs", "plans");
	const report: PlanMoveReport = { moves: [], skipped: [], errors: [] };
	if (options.fallbackDate && !fallbackDatePattern.test(options.fallbackDate)) {
		report.errors.push(`invalid fallback date ${options.fallbackDate}; expected YYYY_MM_DD`);
		return report;
	}
	if (!existsSync(plansRoot)) return report;

	for (const entry of readdirSync(plansRoot).sort()) {
		const from = join(plansRoot, entry);
		const stat = statSync(from);
		if (stat.isDirectory()) {
			report.skipped.push(`directory: ${entry}`);
			continue;
		}
		if (entry.endsWith(".plan.json")) {
			const markdownName = entry.replace(/[.]plan[.]json$/, ".md");
			if (!existsSync(join(plansRoot, markdownName))) report.errors.push(`orphan sidecar: ${entry}`);
			continue;
		}
		if (!entry.endsWith(".md")) {
			report.skipped.push(`non-plan file: ${entry}`);
			continue;
		}

		const match = datedPlanName.exec(entry);
		let dateDir: string | undefined;
		let slug: string;
		if (match?.groups) {
			dateDir = `${match.groups.year}_${match.groups.month}_${match.groups.day}`;
			slug = match.groups.slug;
		} else if (options.fallbackDate) {
			dateDir = options.fallbackDate;
			slug = entry.replace(/[.]md$/, "");
		} else {
			report.skipped.push(`non-dated markdown: ${entry}`);
			continue;
		}

		const toMarkdown = join(plansRoot, dateDir, `${slug}.md`);
		const fromSidecar = sidecarPathFor(from);
		const hasSidecar = existsSync(fromSidecar);
		const move: PlanMove = { fromMarkdown: from, toMarkdown };
		if (hasSidecar) {
			move.fromSidecar = fromSidecar;
			move.toSidecar = sidecarPathFor(toMarkdown);
		}
		if (existsSync(toMarkdown)) report.errors.push(`target exists: ${toMarkdown}`);
		if (move.toSidecar && existsSync(move.toSidecar)) report.errors.push(`target exists: ${move.toSidecar}`);
		report.moves.push(move);
	}
	return report;
}

export function applyLocalPlanMoves(moves: PlanMove[]): void {
	for (const move of moves) {
		if (existsSync(move.toMarkdown)) throw new Error(`target exists: ${move.toMarkdown}`);
		if (move.toSidecar && existsSync(move.toSidecar)) throw new Error(`target exists: ${move.toSidecar}`);
	}
	for (const move of moves) {
		mkdirSync(dirname(move.toMarkdown), { recursive: true });
		renameSync(move.fromMarkdown, move.toMarkdown);
		if (move.fromSidecar && move.toSidecar) {
			mkdirSync(dirname(move.toSidecar), { recursive: true });
			renameSync(move.fromSidecar, move.toSidecar);
			const raw = readFileSync(move.toSidecar, "utf8");
			const sidecar = JSON.parse(raw);
			if (Object.hasOwn(sidecar, "markdownPath")) {
				sidecar.markdownPath = move.toMarkdown;
				writeFileSync(move.toSidecar, `${JSON.stringify(sidecar, null, "\t")}\n`);
			}
		}
	}
}

function parseArgs(argv: string[]): PlanOptions {
	let apply = false;
	let fallbackDate: string | undefined;
	let root = process.cwd();
	for (const arg of argv) {
		if (arg === "--apply") apply = true;
		else if (arg === "--dry-run") apply = false;
		else if (arg.startsWith("--fallback-date=")) fallbackDate = arg.slice("--fallback-date=".length);
		else if (arg.startsWith("--root=")) root = arg.slice("--root=".length);
		else throw new Error(`unknown argument: ${arg}`);
	}
	return { root, apply, fallbackDate };
}

function printReport(report: PlanMoveReport, apply: boolean): void {
	console.log(apply ? "Applying local plan organization" : "Dry run: local plan organization");
	for (const skipped of report.skipped) console.log(`SKIP ${skipped}`);
	for (const error of report.errors) console.error(`ERROR ${error}`);
	for (const move of report.moves) {
		console.log(`MOVE ${move.fromMarkdown} -> ${move.toMarkdown}`);
		if (move.fromSidecar && move.toSidecar) console.log(`MOVE ${move.fromSidecar} -> ${move.toSidecar}`);
	}
	console.log(
		`${report.moves.length} markdown move(s), ${report.skipped.length} skipped, ${report.errors.length} error(s)`,
	);
}

if (import.meta.main) {
	const options = parseArgs(Bun.argv.slice(2));
	const report = planLocalPlanMoves(options);
	printReport(report, options.apply);
	if (report.errors.length > 0) process.exit(1);
	if (options.apply) applyLocalPlanMoves(report.moves);
}
