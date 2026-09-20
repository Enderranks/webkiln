import type { PageDocument, WebKilnProject } from '../types';
import { createDefaultEditorSettings } from '../models/project-schema';

export interface WebKilnTemplatePage {
  name: string;
  slug: string;
  html: string;
}

export interface WebKilnTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  websiteType: string;
  goal: string;
  recommendedPages: string[];
  theme: { primary: string; accent: string; surface: string; radius: string };
  pages: WebKilnTemplatePage[];
}

const page = (name: string, slug: string, html: string): WebKilnTemplatePage => ({
  name,
  slug,
  html,
});
const standardTheme = { primary: '#d6ad61', accent: '#f5efe4', surface: '#111416', radius: '10px' };

function makeTemplate(
  id: string,
  name: string,
  description: string,
  category: string,
  websiteType: string,
  goal: string,
  recommendedPages: string[],
  pages: WebKilnTemplatePage[],
  theme = standardTheme,
): WebKilnTemplate {
  return { id, name, description, category, websiteType, goal, recommendedPages, pages, theme };
}

export const WEBKILN_TEMPLATES: WebKilnTemplate[] = [
  makeTemplate(
    'blank',
    'Blank canvas',
    'A calm, empty starting point for a custom site.',
    'Starter',
    'blank',
    'custom',
    ['/'],
    [
      page(
        'Home',
        '/',
        '<main><section><h1>Your story starts here.</h1><p>Shape this space into something unmistakably yours.</p></section></main>',
      ),
    ],
  ),
  makeTemplate(
    'launch',
    'Launch page',
    'A focused home for a product, service, or announcement.',
    'Business',
    'business',
    'launch',
    ['/', '/about', '/contact'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">A new beginning</p><h1>Make the next move clear.</h1><p>Introduce your work with a considered page built to guide people forward.</p><a href="#contact">Get started</a></section><section><h2>Why this, why now?</h2><p>Give visitors the context they need and a reason to keep exploring.</p></section></main>',
      ),
      page(
        'About',
        '/about',
        '<main><section><h1>Built with intention.</h1><p>Share the people, principles, and perspective behind your work.</p></section></main>',
      ),
      page(
        'Contact',
        '/contact',
        '<main><section><h1>Let’s talk.</h1><p>Make it easy for the right people to reach you.</p><a href="mailto:hello@example.com">hello@example.com</a></section></main>',
      ),
    ],
  ),
  makeTemplate(
    'portfolio',
    'Portfolio system',
    'A flexible home for work, case studies, and ideas.',
    'Creative',
    'portfolio',
    'showcase',
    ['/', '/work', '/about'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">Selected work</p><h1>Ideas made visible.</h1><p>A portfolio with room for the details that make your work matter.</p></section><section><h2>Recent projects</h2><ul><li>Project one</li><li>Project two</li><li>Project three</li></ul></section></main>',
      ),
      page(
        'Work',
        '/work',
        '<main><section><h1>Work, in context.</h1><p>Use this page for case studies, process, and outcomes.</p></section></main>',
      ),
      page(
        'About',
        '/about',
        '<main><section><h1>A little about the studio.</h1><p>Tell a human story about how you work.</p></section></main>',
      ),
    ],
    { ...standardTheme, primary: '#b8c8d8', surface: '#101820' },
  ),
  makeTemplate(
    'hosting',
    'Hosting command center',
    'A confident starting point for game hosting and infrastructure teams.',
    'Underline kit',
    'hosting',
    'sell',
    ['/', '/games', '/pricing', '/support'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">Reliable infrastructure</p><h1>Power your next world.</h1><p>Give players a fast, dependable place to gather.</p><a href="/pricing">See plans</a></section></main>',
      ),
      page(
        'Games',
        '/games',
        '<main><section><h1>Find your game.</h1><p>Show the worlds and server configurations you support.</p></section></main>',
      ),
      page(
        'Pricing',
        '/pricing',
        '<main><section><h1>Plans that scale with your community.</h1><p>Make the choice clear with transparent tiers.</p></section></main>',
      ),
      page(
        'Support',
        '/support',
        '<main><section><h1>Human help when it matters.</h1><p>Point customers to documentation and contact options.</p></section></main>',
      ),
    ],
    { ...standardTheme, primary: '#72d39b', surface: '#0d1314' },
  ),
  makeTemplate(
    'restaurant',
    'Restaurant table',
    'A warm foundation for menus, reservations, and location details.',
    'Hospitality',
    'restaurant',
    'book',
    ['/', '/menu', '/visit'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">Dinner, thoughtfully made</p><h1>A table worth lingering at.</h1><p>Introduce the feeling, flavor, and people behind your kitchen.</p></section></main>',
      ),
      page(
        'Menu',
        '/menu',
        '<main><section><h1>Tonight’s menu.</h1><p>Share a concise, readable menu with seasonal notes.</p></section></main>',
      ),
      page(
        'Visit',
        '/visit',
        '<main><section><h1>Come by.</h1><p>Hours, location, and reservations in one clear place.</p></section></main>',
      ),
    ],
    { primary: '#c97e5b', accent: '#fbf0d8', surface: '#211a17', radius: '14px' },
  ),
  makeTemplate(
    'events',
    'Event house',
    'A clear event hub for dates, speakers, tickets, and updates.',
    'Events',
    'events',
    'register',
    ['/', '/schedule', '/tickets'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">October 18–20</p><h1>Make room for what’s next.</h1><p>Set the tone for an event people will remember.</p><a href="/tickets">Get tickets</a></section></main>',
      ),
      page(
        'Schedule',
        '/schedule',
        '<main><section><h1>Three days, one shared rhythm.</h1><p>Publish sessions, speakers, and places to be.</p></section></main>',
      ),
      page(
        'Tickets',
        '/tickets',
        '<main><section><h1>Choose your pass.</h1><p>Keep ticket options and next steps easy to understand.</p></section></main>',
      ),
    ],
    { primary: '#e08baf', accent: '#f9e6ef', surface: '#17131a', radius: '8px' },
  ),
  makeTemplate(
    'storefront',
    'Storefront',
    'A product-led starting point for a small catalog.',
    'Commerce',
    'ecommerce',
    'sell',
    ['/', '/shop', '/about'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">Made for everyday use</p><h1>Good things, well considered.</h1><p>Lead with the product story and make the next step obvious.</p><a href="/shop">Browse the collection</a></section></main>',
      ),
      page(
        'Shop',
        '/shop',
        '<main><section><h1>The collection.</h1><p>Use this page as the foundation for dynamic products.</p></section></main>',
      ),
      page(
        'About',
        '/about',
        '<main><section><h1>Made with a point of view.</h1><p>Explain the people and practices behind the products.</p></section></main>',
      ),
    ],
    { primary: '#e0b65f', accent: '#fff8e8', surface: '#151411', radius: '6px' },
  ),
  makeTemplate(
    'journal',
    'Journal',
    'A calm editorial system for stories, notes, and recurring content.',
    'Publishing',
    'blog',
    'publish',
    ['/', '/journal', '/about'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">Notes from the field</p><h1>Make space for the long read.</h1><p>Build trust with useful ideas, published consistently.</p></section></main>',
      ),
      page(
        'Journal',
        '/journal',
        '<main><section><h1>Latest notes.</h1><p>Connect this page to a collection when you are ready.</p></section></main>',
      ),
      page(
        'About',
        '/about',
        '<main><section><h1>Why this journal exists.</h1><p>Give readers the context behind your work.</p></section></main>',
      ),
    ],
    { primary: '#b4a9e8', accent: '#f1edff', surface: '#14131b', radius: '12px' },
  ),
  makeTemplate(
    'community',
    'Community home',
    'A welcoming hub for members, resources, and shared activity.',
    'Community',
    'community',
    'connect',
    ['/', '/members', '/resources'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">A place to gather</p><h1>Build something together.</h1><p>Welcome people in and make the next useful resource easy to find.</p></section></main>',
      ),
      page(
        'Members',
        '/members',
        '<main><section><h1>People make the place.</h1><p>Introduce contributors, members, or partners.</p></section></main>',
      ),
      page(
        'Resources',
        '/resources',
        '<main><section><h1>Start here.</h1><p>Organize guides, events, and helpful links.</p></section></main>',
      ),
    ],
    { primary: '#79c5c2', accent: '#e4fbf6', surface: '#101a1b', radius: '16px' },
  ),
  makeTemplate(
    'personal',
    'Personal profile',
    'A minimal, expressive home for an individual and their work.',
    'Personal',
    'personal',
    'introduce',
    ['/', '/now'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">Hello, I’m here</p><h1>A small corner of the internet.</h1><p>Introduce yourself, your work, and what you are exploring now.</p></section></main>',
      ),
      page(
        'Now',
        '/now',
        '<main><section><h1>What I’m working on.</h1><p>A living page for current projects and interests.</p></section></main>',
      ),
    ],
    { primary: '#edb36c', accent: '#fff1d8', surface: '#1c1710', radius: '20px' },
  ),
  makeTemplate(
    'documentation',
    'Documentation',
    'A practical information architecture for products, teams, and knowledge.',
    'Documentation',
    'documentation',
    'explain',
    ['/', '/guides', '/reference'],
    [
      page(
        'Home',
        '/',
        '<main><section><p class="eyebrow">WebKiln documentation</p><h1>Find the next answer.</h1><p>Give people a clear path through guides, references, and decisions.</p></section></main>',
      ),
      page(
        'Guides',
        '/guides',
        '<main><section><h1>Guides.</h1><p>Organize practical, task-oriented documentation here.</p></section></main>',
      ),
      page(
        'Reference',
        '/reference',
        '<main><section><h1>Reference.</h1><p>Keep precise details close to the people who need them.</p></section></main>',
      ),
    ],
    { primary: '#7ca8ed', accent: '#e6efff', surface: '#10151f', radius: '8px' },
  ),
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

export interface TemplateProjectOptions {
  description?: string;
  businessType?: string;
  goal?: string;
  selectedPageSlugs?: string[];
  primaryColor?: string;
  style?: 'editorial' | 'technical' | 'warm' | 'minimal';
}

export function createTemplateProject(
  template: WebKilnTemplate,
  siteId: string,
  title: string,
  options: TemplateProjectOptions = {},
): WebKilnProject {
  const now = new Date().toISOString();
  const selected = options.selectedPageSlugs?.length ? new Set(options.selectedPageSlugs) : null;
  const sourcePages = template.pages.filter(
    (item) => !selected || selected.has(item.slug) || item.slug === '/',
  );
  const pages: PageDocument[] = sourcePages.map((item, index) => ({
    id: index === 0 ? 'home' : template.id + '-' + (index + 1),
    name: item.name,
    slug: item.slug,
    projectData: { components: item.html },
    updatedAt: now,
    isHomepage: index === 0,
    seo: {
      title: item.name === 'Home' ? title : item.name + ' · ' + title,
      description: options.description ?? '',
    },
    settings: { showInNavigation: true, passwordProtected: false },
  }));
  const primary = options.primaryColor || template.theme.primary;
  return {
    schemaVersion: 3,
    site: {
      id: siteId,
      title,
      description: options.description ?? '',
      language: 'en',
      timezone: 'UTC',
      businessType: options.businessType || template.websiteType,
      goal: options.goal || template.goal,
      seoEnabled: true,
    },
    pages,
    deletedPages: [],
    homepagePageId: pages[0].id,
    currentPageId: pages[0].id,
    themeTokens: {
      primary,
      accent: template.theme.accent,
      surface: template.theme.surface,
      radius: template.theme.radius,
      style: options.style || 'minimal',
    },
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
