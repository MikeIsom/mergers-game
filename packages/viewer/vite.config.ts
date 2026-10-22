import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	plugins: [svelte()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		cssCodeSplit: false,
		sourcemap: true,
		// Vite requires a bundle name; registerViewer owns the acquire global.
		lib: {
			name: "acquireBundle",
			entry: "src/viewer.ts",
			formats: ["iife"],
			fileName: () => "acquire-viewer.iife.js",
		},
		rollupOptions: {
			output: {
				assetFileNames: (asset) =>
					asset.names?.some((n) => n.endsWith(".css")) ? "acquire-viewer.css" : "[name]-[hash][extname]",
			},
		},
	},
	server: {
		port: 5173,
		strictPort: false,
	},
});
