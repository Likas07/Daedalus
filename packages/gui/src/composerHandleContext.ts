import { createContext, type MutableRefObject, useContext } from "react";
import type { ChatComposerHandle } from "./components/chat/ChatComposer";

export type ComposerHandleRef = MutableRefObject<ChatComposerHandle | null>;

export const ComposerHandleContext = createContext<ComposerHandleRef | null>(null);

export function useComposerHandleContext(): ComposerHandleRef | null {
	return useContext(ComposerHandleContext);
}
