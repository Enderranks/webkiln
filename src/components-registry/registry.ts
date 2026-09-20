export interface ComponentDefinition {
  id: string;
  version: number;
  category: 'layout' | 'content' | 'commerce' | 'forms' | 'media';
  displayName: string;
  defaultContent: string;
  defaultStyles: Record<string, string>;
  editableTraits: string[];
  allowedParents: string[];
  responsive: boolean;
  guidedControls?: string[];
  explanation?: string;
  smartSection?: {
    purpose: string;
    requiredContent: string[];
    variants: string[];
    dataSource?: string;
  };
  migrate?: (value: unknown) => unknown;
}

const definitions: Array<[string, string, ComponentDefinition['category'], string]> = [
  [
    'section',
    'Section',
    'layout',
    '<section class="section-block"><h2>Section title</h2></section>',
  ],
  ['container', 'Container', 'layout', '<div class="container"><p>Container content</p></div>'],
  [
    'columns',
    'Columns',
    'layout',
    '<div class="columns"><div>Column one</div><div>Column two</div></div>',
  ],
  ['spacer', 'Spacer', 'layout', '<div class="spacer" aria-hidden="true"></div>'],
  ['divider', 'Divider', 'layout', '<hr class="divider" />'],
  ['heading', 'Heading', 'content', '<h2>Heading</h2>'],
  ['paragraph', 'Paragraph', 'content', '<p>Write a clear paragraph here.</p>'],
  ['button', 'Button', 'content', '<a class="button" href="#">Call to action</a>'],
  [
    'image',
    'Image',
    'media',
    '<img src="https://placehold.co/800x460/171c1f/d6ad61?text=Image" alt="Placeholder image" />',
  ],
  [
    'navigation',
    'Navigation',
    'content',
    '<nav><a href="#">Home</a><a href="#">About</a><a href="#">Contact</a></nav>',
  ],
  [
    'hero',
    'Hero',
    'content',
    '<section class="inserted section-block"><span class="overline">YOUR NEXT BIG IDEA</span><h2>A headline that gets attention.</h2><p>Add a short description that makes the value clear.</p><a class="button" href="#">Get started</a></section>',
  ],
  [
    'gallery',
    'Media gallery',
    'media',
    '<section class="inserted section-block"><h3>Show the experience.</h3><div class="media-grid"><div>Image one</div><div>Image two</div><div>Image three</div></div></section>',
  ],
  [
    'pricing',
    'Pricing plans',
    'commerce',
    '<section class="inserted section-block"><h3>Simple pricing, no surprises.</h3><p>Starter $4.99 · Community $9.99 · Pro $19.99</p></section>',
  ],
  [
    'faq',
    'FAQ',
    'content',
    '<section class="inserted section-block"><h3>Frequently asked questions</h3><details open><summary>How does it work?</summary><p>Start with a block and customize it.</p></details></section>',
  ],
  [
    'contact',
    'Contact form',
    'forms',
    '<section class="inserted section-block"><h3>Let’s build something better.</h3><form><input required placeholder="Your name" /><input required type="email" placeholder="Email address" /><button type="submit">Send enquiry</button></form></section>',
  ],
  [
    'newsletter',
    'Newsletter',
    'forms',
    '<section class="inserted section-block"><h3>Stay in the loop.</h3><form><input required type="email" placeholder="Email address" /><button type="submit">Subscribe</button></form></section>',
  ],
  [
    'form',
    'Form',
    'forms',
    '<form class="inserted section-block"><label>Name<input required /></label><button type="submit">Submit</button></form>',
  ],
  [
    'footer',
    'Footer',
    'content',
    '<footer class="inserted section-block"><h3>UNDERLINE</h3><p>Links and legal details.</p></footer>',
  ],
  [
    'features',
    'Feature grid',
    'content',
    '<section class="wk-smart-section wk-features" data-wk-smart="features"><p class="overline">WHY CHOOSE US</p><h2>Everything you need to move forward.</h2><div class="columns"><article><h3>Clear by design</h3><p>Explain the first benefit in a sentence.</p></article><article><h3>Made to adapt</h3><p>Show how your work meets people where they are.</p></article><article><h3>Ready to grow</h3><p>Give visitors a reason to take the next step.</p></article></div></section>',
  ],
  [
    'services',
    'Services',
    'content',
    '<section class="wk-smart-section wk-services" data-wk-smart="services"><h2>What we do</h2><div class="columns"><article><h3>Service one</h3><p>Describe the outcome clearly.</p></article><article><h3>Service two</h3><p>Describe the value in plain language.</p></article></div></section>',
  ],
  [
    'testimonials',
    'Testimonials',
    'content',
    '<section class="wk-smart-section wk-testimonials" data-wk-smart="testimonials"><h2>Kind words from good people.</h2><blockquote>“A thoughtful experience from first click to last.”</blockquote><p>Customer name · Role</p></section>',
  ],
  [
    'team',
    'Team',
    'content',
    '<section class="wk-smart-section wk-team" data-wk-smart="team"><h2>Meet the team</h2><div class="columns"><article><h3>Team member</h3><p>Role and a short introduction.</p></article><article><h3>Team member</h3><p>Role and a short introduction.</p></article></div></section>',
  ],
  [
    'blog',
    'Blog listing',
    'content',
    '<section class="wk-smart-section wk-blog" data-wk-smart="blog"><h2>Latest thinking</h2><div class="columns"><article><h3>Article title</h3><p>Summary and a link to the full story.</p></article><article><h3>Article title</h3><p>Summary and a link to the full story.</p></article></div></section>',
  ],
  [
    'events',
    'Events',
    'content',
    '<section class="wk-smart-section wk-events" data-wk-smart="events"><h2>Upcoming events</h2><article><h3>Event title</h3><p>Date · Venue · Availability</p><a class="button" href="#">Learn more</a></article></section>',
  ],
  [
    'business-hours',
    'Business hours',
    'content',
    '<section class="wk-smart-section wk-business-hours" data-wk-smart="business-hours"><h2>When to find us</h2><dl><dt>Monday–Friday</dt><dd>9:00 AM–5:00 PM</dd><dt>Saturday–Sunday</dt><dd>Closed</dd></dl></section>',
  ],
  [
    'tabs',
    'Tabs',
    'content',
    '<section class="wk-tabs" data-wk-component="tabs"><div role="tablist"><button role="tab" aria-selected="true" aria-controls="tab-panel-1">First tab</button><button role="tab" aria-selected="false" aria-controls="tab-panel-2">Second tab</button></div><div id="tab-panel-1" role="tabpanel">Tab content</div><div id="tab-panel-2" role="tabpanel" hidden>More content</div></section>',
  ],
  [
    'accordion',
    'Accordion',
    'content',
    '<section class="wk-accordion" data-wk-component="accordion"><details><summary>Frequently asked question</summary><p>Answer with useful context.</p></details></section>',
  ],
  [
    'modal',
    'Modal',
    'content',
    '<dialog class="wk-modal" aria-labelledby="modal-title"><button type="button" aria-label="Close dialog">×</button><h2 id="modal-title">A focused message</h2><p>Keep important content in a keyboard-accessible dialog.</p></dialog>',
  ],
  [
    'drawer',
    'Drawer',
    'content',
    '<aside class="wk-drawer" aria-hidden="true" hidden><button type="button" aria-label="Close drawer">×</button><h2>More details</h2></aside>',
  ],
  [
    'tooltip',
    'Tooltip',
    'content',
    '<span class="wk-tooltip" tabindex="0" aria-describedby="tooltip-copy">Hover or focus me<span id="tooltip-copy" role="tooltip">Helpful context</span></span>',
  ],
  [
    'carousel',
    'Carousel',
    'media',
    '<section class="wk-carousel" aria-roledescription="carousel"><button type="button" aria-label="Previous slide">‹</button><div aria-live="polite">Slide one</div><button type="button" aria-label="Next slide">›</button></section>',
  ],
  [
    'before-after',
    'Before-and-after slider',
    'media',
    '<div class="wk-before-after"><div>Before</div><div>After</div><label><span class="sr-only">Compare images</span><input type="range" min="0" max="100" value="50" /></label></div>',
  ],
  [
    'counter',
    'Animated counter',
    'content',
    '<span class="wk-counter" data-wk-value="100" aria-live="polite">0</span>',
  ],
  [
    'sticky-navigation',
    'Sticky navigation',
    'content',
    '<nav class="wk-sticky-navigation" aria-label="Sticky navigation"><a href="#top">Back to top</a></nav>',
  ],
  [
    'announcement-banner',
    'Announcement banner',
    'content',
    '<aside class="wk-announcement" role="status"><strong>Announcement</strong><span>Share a timely update.</span><button type="button" aria-label="Dismiss announcement">×</button></aside>',
  ],
];

const SMART_SECTION_METADATA: Record<string, NonNullable<ComponentDefinition['smartSection']>> = {
  features: {
    purpose: 'Explain the strongest benefits in a scannable grid.',
    requiredContent: ['Section heading', 'At least two benefit titles', 'Benefit descriptions'],
    variants: ['cards', 'columns', 'stacked'],
    dataSource: 'Optional CMS collection of features',
  },
  services: {
    purpose: 'Present offerings with clear outcomes and next steps.',
    requiredContent: ['Section heading', 'Service names', 'Service descriptions'],
    variants: ['columns', 'stacked', 'compact'],
    dataSource: 'Optional CMS collection of services',
  },
  testimonials: {
    purpose: 'Build trust with attributed customer proof.',
    requiredContent: ['Quote', 'Customer name', 'Role or company'],
    variants: ['quote', 'cards', 'carousel'],
    dataSource: 'Optional CMS collection of testimonials',
  },
  team: {
    purpose: 'Introduce the people behind the work.',
    requiredContent: [
      'Section heading',
      'Name',
      'Role',
      'Accessible image alt text when imagery is added',
    ],
    variants: ['cards', 'compact', 'stacked'],
    dataSource: 'Optional CMS collection of team members',
  },
  blog: {
    purpose: 'Help visitors discover recent stories and updates.',
    requiredContent: ['Section heading', 'Article title', 'Summary', 'Link'],
    variants: ['cards', 'list', 'featured'],
    dataSource: 'Optional CMS collection of posts',
  },
  events: {
    purpose: 'Make dates, venues, and availability easy to scan.',
    requiredContent: ['Event title', 'Date', 'Venue or online location', 'Availability'],
    variants: ['cards', 'list', 'calendar'],
    dataSource: 'Optional CMS collection of events',
  },
  'business-hours': {
    purpose: 'Set accurate visitor expectations for availability.',
    requiredContent: ['Day labels', 'Opening times', 'Timezone when relevant'],
    variants: ['table', 'stacked', 'compact'],
  },
};

export const componentRegistry: ComponentDefinition[] = definitions.map(
  ([id, displayName, category, defaultContent]) => ({
    id,
    displayName,
    category,
    version: 1,
    defaultContent,
    defaultStyles: {},
    editableTraits: ['content', 'style', 'id', 'classes'],
    allowedParents: ['wrapper', 'body', 'section', 'container', 'columns'],
    responsive: true,
    guidedControls: ['content', 'responsive'],
    explanation: 'This component is safe to edit visually and adapts across breakpoints.',
    ...(SMART_SECTION_METADATA[id] ? { smartSection: SMART_SECTION_METADATA[id] } : {}),
    migrate: (value) => value,
  }),
);

export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return componentRegistry.find((item) => item.id === id);
}
