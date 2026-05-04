if (process.platform === "linux") {
	process.env.ELECTRON_OZONE_PLATFORM_HINT = "x11";
}

await import("./main");

export {};
