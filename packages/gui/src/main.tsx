import { createBrowserHistory, createHashHistory, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";

import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { APP_DISPLAY_NAME } from "./branding";
import { isElectron } from "./env";
import { syncDocumentWindowControlsOverlayClass } from "./lib/windowControlsOverlay";
import { getRouter } from "./router";

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

if (isElectron) {
	syncDocumentWindowControlsOverlayClass();
}

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>,
);
