import type { Configuration } from "electron-builder";

const config: Configuration = {
	appId: "dev.daedalus.daedalus",
	productName: "Daedalus",
	directories: {
		app: ".",
		output: "release",
	},
	files: [
		"package.json",
		"dist/**/*",
	],
	extraResources: [
		{
			from: "../gui/dist",
			to: "gui/dist",
			filter: ["**/*"],
		},
		{
			from: "resources/app-server",
			to: "app-server",
			filter: ["**/*"],
		},
	],
	asar: true,
	asarUnpack: [
		"**/*.node",
		"**/node-pty/**",
		"**/@serialport/**",
	],
	afterPack: "./scripts/validate-packaged-runtime.ts",
	linux: {
		category: "Development",
		target: ["dir"],
	},
	mac: {
		category: "public.app-category.developer-tools",
		target: ["dir"],
	},
	win: {
		target: ["dir"],
	},
};

export default config;
