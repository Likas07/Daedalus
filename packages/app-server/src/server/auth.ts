export interface AuthOptions {
	readonly token?: string;
	readonly allowedOrigins?: readonly string[];
	readonly host?: string;
}

export function createCapabilityToken(): string {
	return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

export function isLoopbackHost(host: string): boolean {
	const value = host.split(":")[0]?.toLowerCase() ?? "";
	return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

export function isAllowedOrigin(request: Request, options: AuthOptions): boolean {
	const origin = request.headers.get("origin");
	if (!origin) return true;
	if (options.allowedOrigins?.includes(origin)) return true;
	try {
		const url = new URL(origin);
		return isLoopbackHost(url.hostname) && isLoopbackHost(options.host ?? "127.0.0.1");
	} catch {
		return false;
	}
}

export function authenticateRequest(request: Request, options: AuthOptions): boolean {
	if (!isAllowedOrigin(request, options)) return false;
	if (!options.token) return true;
	const header = request.headers.get("authorization");
	if (header === `Bearer ${options.token}`) return true;
	const url = new URL(request.url);
	return url.searchParams.get("token") === options.token;
}
