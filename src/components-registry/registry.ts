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
  [
    'game-selector',
    'Game selector',
    'commerce',
    '<section class="wk-smart-section wk-game-selector" data-wk-smart="game-selector"><h2>Choose your game</h2><label>Game<select><option>Minecraft</option><option>Palworld</option></select></label></section>',
  ],
  [
    'game-plans',
    'Game plans',
    'commerce',
    '<section class="wk-smart-section wk-game-plans" data-wk-smart="game-plans"><h2>Plans for every world</h2><div class="columns"><article><h3>Starter</h3><p>4 GB RAM · 10 players</p><a class="button" href="#">Choose plan</a></article><article><h3>Community</h3><p>8 GB RAM · 25 players</p><a class="button" href="#">Choose plan</a></article></div></section>',
  ],
  [
    'ram-calculator',
    'RAM calculator',
    'commerce',
    '<section class="wk-smart-section wk-ram-calculator" data-wk-smart="ram-calculator"><h2>Estimate your server</h2><label>Players<input type="number" min="1" value="10" /></label><p>Recommended: 4 GB RAM</p></section>',
  ],
  [
    'server-location',
    'Server location selector',
    'commerce',
    '<section class="wk-smart-section wk-server-location" data-wk-smart="server-location"><h2>Choose a location</h2><label>Region<select><option>North America</option><option>Europe</option><option>Asia Pacific</option></select></label></section>',
  ],
  [
    'server-status',
    'Server status',
    'content',
    '<section class="wk-smart-section wk-server-status" data-wk-smart="server-status" role="status"><h2>All systems operational</h2><p>Network and game services are responding normally.</p></section>',
  ],
  [
    'network-status',
    'Network status',
    'content',
    '<section class="wk-smart-section wk-network-status" data-wk-smart="network-status"><h2>Network status</h2><ul><li>North America <strong>Operational</strong></li><li>Europe <strong>Operational</strong></li></ul></section>',
  ],
  [
    'modpack-showcase',
    'Modpack showcase',
    'media',
    '<section class="wk-smart-section wk-modpack-showcase" data-wk-smart="modpack-showcase"><h2>Explore the modpack</h2><p>Showcase supported worlds, versions, and install instructions.</p></section>',
  ],
  [
    'incident-banner',
    'Incident banner',
    'content',
    '<aside class="wk-smart-section wk-incident-banner" data-wk-smart="incident-banner" role="alert"><strong>Service notice</strong><p>Share a clear update and expected resolution.</p></aside>',
  ],
  [
    'hosting-quote',
    'Custom hosting quote',
    'forms',
    '<section class="wk-smart-section wk-hosting-quote" data-wk-smart="hosting-quote"><h2>Need something custom?</h2><p>Tell us about your world and we will shape a hosting plan.</p><a class="button" href="#quote">Request a quote</a></section>',
  ],
  [
    'venue-listing',
    'Venue listing',
    'content',
    '<section class="wk-smart-section wk-venue-listing" data-wk-smart="venue-listing"><h2>Find your venue</h2><div class="columns"><article><h3>Venue name</h3><p>Capacity · Location · Availability</p></article></div></section>',
  ],
  [
    'room-listing',
    'Room listing',
    'content',
    '<section class="wk-smart-section wk-room-listing" data-wk-smart="room-listing"><h2>Rooms and spaces</h2><div class="columns"><article><h3>Room name</h3><p>Capacity · Layout · Rate</p></article></div></section>',
  ],
  [
    'event-calendar',
    'Event calendar',
    'content',
    '<section class="wk-smart-section wk-event-calendar" data-wk-smart="event-calendar"><h2>Upcoming events</h2><p>Date · Venue · Availability</p></section>',
  ],
  [
    'availability',
    'Availability',
    'content',
    '<section class="wk-smart-section wk-availability" data-wk-smart="availability"><h2>Check availability</h2><label>Date<input type="date" /></label><p>Available options appear here.</p></section>',
  ],
  [
    'booking-request',
    'Booking request',
    'forms',
    '<section class="wk-smart-section wk-booking-request" data-wk-smart="booking-request"><h2>Request a booking</h2><form><label>Name<input required /></label><label>Email<input type="email" required /></label><button type="submit">Send request</button></form></section>',
  ],
  [
    'ticket-listing',
    'Ticket listing',
    'commerce',
    '<section class="wk-smart-section wk-ticket-listing" data-wk-smart="ticket-listing"><h2>Tickets</h2><div class="columns"><article><h3>General admission</h3><p>From $25 · Available now</p></article></div></section>',
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
  'game-selector': {
    purpose: 'Help visitors select a game before choosing a compatible hosting plan.',
    requiredContent: ['Game name', 'Accessible selector label', 'Supported games'],
    variants: ['select', 'cards', 'featured'],
    dataSource: 'Optional CMS collection of games',
  },
  'game-plans': {
    purpose: 'Present hosting plans with capacity and game-specific details.',
    requiredContent: ['Plan name', 'RAM', 'Player capacity', 'Call to action'],
    variants: ['cards', 'comparison', 'stacked'],
    dataSource: 'Optional CMS collection of hosting plans',
  },
  'server-status': {
    purpose: 'Communicate infrastructure health without inventing live measurements.',
    requiredContent: ['Status label', 'Affected service or region', 'Last updated source'],
    variants: ['summary', 'services', 'incident'],
    dataSource: 'Configured status provider or manual content',
  },
  'venue-listing': {
    purpose: 'Help visitors compare venues by capacity, location, and availability.',
    requiredContent: ['Venue name', 'Location', 'Capacity', 'Accessible image text'],
    variants: ['cards', 'list', 'map-placeholder'],
    dataSource: 'Optional CMS collection of venues',
  },
  'booking-request': {
    purpose: 'Collect a structured booking request with accessible form fields.',
    requiredContent: ['Name', 'Contact method', 'Requested date', 'Consent language'],
    variants: ['short', 'detailed', 'multi-step'],
    dataSource: 'Configured WebKiln form definition',
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
