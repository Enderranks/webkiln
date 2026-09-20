import type { PageDocument, WebKilnProject } from '../types';
import { createDefaultEditorSettings } from '../models/project-schema';

export interface WebKilnTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  pages: Array<{ name: string; slug: string; html: string }>;
}

export const WEBKILN_TEMPLATES: WebKilnTemplate[] = [
  {
    id: 'blank',
    name: 'Blank canvas',
    description: 'A calm, empty starting point for a custom site.',
    category: 'Starter',
    pages: [
      {
        name: 'Home',
        slug: '/',
        html: '<main><section><h1>Your story starts here.</h1><p>Shape this space into something unmistakably yours.</p></section></main>',
      },
    ],
  },
  {
    id: 'launch',
    name: 'Launch page',
    description: 'A focused home for a product, service, or announcement.',
    category: 'Business',
    pages: [
      {
        name: 'Home',
        slug: '/',
        html: '<main><section><p class="eyebrow">A new beginning</p><h1>Make the next move clear.</h1><p>Introduce your work with a considered page built to guide people forward.</p><a href="#contact">Get started</a></section><section><h2>Why this, why now?</h2><p>Give visitors the context they need and a reason to keep exploring.</p></section></main>',
      },
      {
        name: 'About',
        slug: '/about',
        html: '<main><section><h1>Built with intention.</h1><p>Share the people, principles, and perspective behind your work.</p></section></main>',
      },
      {
        name: 'Contact',
        slug: '/contact',
        html: '<main><section><h1>Let’s talk.</h1><p>Make it easy for the right people to reach you.</p><a href="mailto:hello@example.com">hello@example.com</a></section></main>',
      },
    ],
  },
  {
    id: 'portfolio',
    name: 'Portfolio system',
    description: 'A flexible home for work, case studies, and ideas.',
    category: 'Creative',
    pages: [
      {
        name: 'Home',
        slug: '/',
        html: '<main><section><p class="eyebrow">Selected work</p><h1>Ideas made visible.</h1><p>A portfolio with room for the details that make your work matter.</p></section><section><h2>Recent projects</h2><ul><li>Project one</li><li>Project two</li><li>Project three</li></ul></section></main>',
      },
      {
        name: 'Work',
        slug: '/work',
        html: '<main><section><h1>Work, in context.</h1><p>Use this page for case studies, process, and outcomes.</p></section></main>',
      },
      {
        name: 'About',
        slug: '/about',
        html: '<main><section><h1>A little about the studio.</h1><p>Tell a human story about how you work.</p></section></main>',
      },
    ],
  },
];

export function templateById(id: string | null | undefined): WebKilnTemplate {
  const normalized = id?.toLowerCase().replace(/\s+/g, '-') ?? '';
  return (
    WEBKILN_TEMPLATES.find(
      (template) =>
        template.id === normalized ||
        template.name.toLowerCase().replace(/\s+/g, '-') === normalized,
    ) ?? WEBKILN_TEMPLATES[0]
  );
}

export function createTemplateProject(
  template: WebKilnTemplate,
  siteId: string,
  title: string,
): WebKilnProject {
  const now = new Date().toISOString();
  const pages: PageDocument[] = template.pages.map((page, index) => ({
    id: index === 0 ? 'home' : `${template.id}-${index + 1}`,
    name: page.name,
    slug: page.slug,
    projectData: { components: page.html },
    updatedAt: now,
    isHomepage: index === 0,
    seo: { title: page.name === 'Home' ? title : `${page.name} · ${title}`, description: '' },
    settings: { showInNavigation: true, passwordProtected: false },
  }));
  return {
    schemaVersion: 3,
    site: { id: siteId, title, description: '', language: 'en', timezone: 'UTC' },
    pages,
    deletedPages: [],
    homepagePageId: pages[0].id,
    currentPageId: pages[0].id,
    themeTokens: { primary: '#d6ad61', radius: '10px' },
    editorSettings: createDefaultEditorSettings(),
    assets: [],
    customCode: { html: '', css: '', javascript: '', isolated: true },
    revisions: [
      {
        id: 'initial',
        label: 'Template starting point',
        createdAt: now,
        pageId: pages[0].id,
        projectData: pages[0].projectData,
      },
    ],
  };
}
