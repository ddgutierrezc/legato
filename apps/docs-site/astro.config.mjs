// @ts-check
import { defineConfig } from 'astro/config';
import mermaid from 'astro-mermaid';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://legato-docs.netlify.app',
	integrations: [
		mermaid({
			enableLog: false,
		}),
		starlight({
			title: 'Legato Docs',
			description:
				'Canonical public documentation for Legato contract and Capacitor integration packages.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ddgutierrezc/legato' },
				{ icon: 'discord', label: 'Discord', href: 'https://discord.com/invite/Hhnumyk2N' },
				{ icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/ddgutierrezc' },
			],
			editLink: {
				baseUrl: 'https://github.com/ddgutierrezc/legato/edit/main/apps/docs-site/src/content/docs/',
			},
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Overview', slug: 'getting-started' },
						{ label: 'First Contract Integration', slug: 'tutorials/first-contract-integration' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'Public vs Maintainer Boundaries', slug: 'concepts' },
						{ label: 'Architecture', slug: 'explanation/architecture' },
					],
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
