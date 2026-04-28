// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Legato Docs',
			description:
				'Canonical public documentation for Legato contract and Capacitor integration packages.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/ddgutierrezc/legato' }],
			editLink: {
				baseUrl: 'https://github.com/ddgutierrezc/legato/edit/main/apps/docs-site/src/content/docs/',
			},
			sidebar: [
				{
					label: 'Getting Started',
					items: [{ label: 'Overview', slug: 'getting-started' }],
				},
				{
					label: 'Concepts',
					items: [{ label: 'Public vs Maintainer Boundaries', slug: 'concepts' }],
				},
				{
					label: 'Package Guides',
					autogenerate: { directory: 'packages' },
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
				{
					label: 'Releases',
					autogenerate: { directory: 'releases' },
				},
				{
					label: 'Community',
					items: [{ label: 'Community & Contributions', slug: 'community' }],
				},
			],
		}),
	],
});
