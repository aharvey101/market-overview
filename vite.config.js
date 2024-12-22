import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [sveltekit()],
    optimizeDeps: {
        exclude: ['@sveltejs/kit']
    },
    server: {
        fs: {
            allow: ['.']
        }
    },
    build: {
        target: 'esnext'
    }
}); 