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
];

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
    migrate: (value) => value,
  }),
);

export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return componentRegistry.find((item) => item.id === id);
}
