import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const repository = process.env.GITHUB_REPOSITORY;
const repositoryName = repository ? repository.split('/')[1] : 'khadim';
const isPagesBuild = process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  site: 'https://hananinas.github.io',
  base: isPagesBuild ? `/${repositoryName}` : undefined,
  integrations: [
    starlight({
      title: 'Khadim Plugin SDK',
      description: 'Documentation for building Khadim plugins with the Plugin SDK and AssemblyScript examples.',
      customCss: ['/src/styles/unravel-theme.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/hananinas/khadim',
        },
      ],
    }),
  ],
});
