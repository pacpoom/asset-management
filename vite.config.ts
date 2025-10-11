import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			// Allow serving files from the 'uploads' directory,
			// which is located at the root of your project.
			allow: [path.resolve(process.cwd(), 'uploads')]
		}
	}
});

