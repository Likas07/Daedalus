export {
	__resetServerAuthBootstrapForTests,
	createServerPairingCredential,
	fetchSessionState,
	listServerClientSessions,
	listServerPairingLinks,
	peekPairingTokenFromUrl,
	resolveInitialServerAuthGateState,
	revokeOtherServerClientSessions,
	revokeServerClientSession,
	revokeServerPairingLink,
	type ServerClientSessionRecord,
	type ServerPairingLinkRecord,
	stripPairingTokenFromUrl,
	submitServerAuthCredential,
	takePairingTokenFromUrl,
} from "./auth";
export {
	__resetPrimaryEnvironmentBootstrapForTests,
	__resetPrimaryEnvironmentDescriptorBootstrapForTests,
	getPrimaryKnownEnvironment,
	readPrimaryEnvironmentDescriptor,
	resetPrimaryEnvironmentDescriptorForTests,
	resolveInitialPrimaryEnvironmentDescriptor,
	resolveInitialPrimaryEnvironmentDescriptor as ensurePrimaryEnvironmentReady,
	usePrimaryEnvironmentId,
	writePrimaryEnvironmentDescriptor,
	writePrimaryEnvironmentDescriptor as updatePrimaryEnvironmentDescriptor,
} from "./context";

export { isLoopbackHostname, resolvePrimaryEnvironmentHttpUrl } from "./target";
