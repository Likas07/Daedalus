import type { Configuration } from "electron-builder";

const config: Configuration = {
	appId: "dev.daedalus.daedalus",
	productName: "Daedalus",
	executableName: "daedalus",
	directories: {
		app: ".",
		output: "../../release/desktop",
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
		executableName: "daedalus",
		target: ["AppImage", "dir"],
		desktop: {
			entry: {
				StartupWMClass: "daedalus",
			},
		},
	},
	mac: {
		category: "public.app-category.developer-tools",
		target: ["dmg", "dir"],
	},
	win: {
		target: ["nsis", "dir"],
	},
};

export default config;
