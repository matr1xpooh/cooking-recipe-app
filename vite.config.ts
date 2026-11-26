import { loadEnv } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from 'svelte-kit-sst';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Which recipe store the server code uses. It is fixed when the app is built, so a build
 * for AWS never contains the local-file store. A build must say which one: STORE=aws for
 * the deploy, STORE=file for a local build. Dev and tests default to the local file store.
 */
function configuredStore(command: 'build' | 'serve', mode: string): 'file' | 'aws' | undefined {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
	const kind = env.STORE;
	if (kind === 'file' || kind === 'aws') return kind;
	if (kind !== undefined) throw new Error(`STORE must be "file" or "aws", not "${kind}"`);
	// Dev and tests use the file store. A build with no choice is refused by requireStoreForBuild.
	return command === 'build' ? undefined : 'file';
}

/** Refuses a real build that has no STORE. Config loading (e.g. svelte-kit sync) does not call this. */
const requireStoreForBuild = (kind: string | undefined) => ({
	name: 'require-store-for-build',
	buildStart() {
		if (kind === undefined) {
			throw new Error(
				'Set STORE=aws (deploy) or STORE=file (local build): the store is chosen at build time.'
			);
		}
	}
});

export default defineConfig(({ command, mode }) => {
	const kind = configuredStore(command, mode);
	return {
		define: {
			__RECIPE_STORE__: JSON.stringify(kind ?? 'file')
		},
		plugins: [
			requireStoreForBuild(kind),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
				// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
				// See https://svelte.dev/docs/kit/adapters for more information about adapters.
				adapter: adapter()
			}),

			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				emitTsDeclarations: true
			})
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [{ browser: 'chromium', headless: true }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},

				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});
