declare module "react" {
	export type ReactNode = unknown;
	export type CSSProperties = Record<string, string | number | undefined>;

	export interface ReactElement {
		readonly type: unknown;
		readonly props: unknown;
		readonly key: string | null;
	}

	export function createElement(
		type: string | ((props: any) => ReactNode),
		props?: Record<string, unknown> | null,
		...children: ReactNode[]
	): ReactElement;

	const React: {
		readonly createElement: typeof createElement;
	};

	export default React;
}
