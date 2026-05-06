if (process.platform === "linux") {
	delete process.env.ELECTRON_OZONE_PLATFORM_HINT;
}

await import("./main-actual.js");

export {};
