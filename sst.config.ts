// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- SST generates this file; its template uses this form.
/// <reference path="./.sst/platform/config.d.ts" />

// Phase 5 spike: declares only the SvelteKit site so SST can download its AWS components.
// Not deployed. The real configuration replaces this in phase 5 step 4.
export default $config({
	app(input) {
		return {
			name: 'recipes',
			removal: input?.stage === 'production' ? 'retain' : 'remove',
			home: 'aws',
			providers: { aws: { region: 'eu-west-1' } }
		};
	},
	async run() {
		const site = new sst.aws.SvelteKit('Site');
		return { url: site.url };
	}
});
