import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Explicitly use adapter-node to create a standalone Node.js server.
		// This is the correct adapter for a Docker deployment.
		adapter: adapter({
            // The output directory for the server build.
            out: 'build'
        })
	}
};

export default config;