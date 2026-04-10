export interface GuardResult {
	block: boolean;
	reason: string;
}

export interface PersistableState {
	[key: string]: unknown;
}
