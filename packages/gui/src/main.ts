import { createApp } from "./app";

void createApp()
	.then((app) => app.start())
	.catch((error) => {
		const root = document.getElementById("app") ?? document.body;
		root.textContent = error instanceof Error ? error.message : String(error);
	});
