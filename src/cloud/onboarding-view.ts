import type { WebKilnApiClient } from './api-client';
import type { Session, Workspace } from './contracts';
import { navigate } from './app-router';
import { createTemplateProject, templateById, WEBKILN_TEMPLATES } from './template-catalog';

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

export async function renderOnboarding(cloud: WebKilnApiClient, session: Session): Promise<void> {
  const selectedTemplate = new URLSearchParams(window.location.search).get('template') ?? 'blank';
  const templateCards = WEBKILN_TEMPLATES.map(
    (template) =>
      '<label class="onboarding-template"><input type="radio" name="templateId" value="' +
      template.id +
      '" ' +
      (template.id === selectedTemplate ? 'checked' : '') +
      '/><span><strong>' +
      esc(template.name) +
      '</strong><small>' +
      esc(template.description) +
      '</small><em>' +
      esc(template.category) +
      ' · ' +
      template.pages.length +
      ' pages</em></span></label>',
  ).join('');
  document.body.innerHTML =
    '<main class="cloud-app onboarding-app"><header class="cloud-topbar"><a class="cloud-brand" href="/dashboard"><span class="brand-mark">W</span><span>WEBKILN</span></a><span class="onboarding-step" data-step-label>Step 1 of 4</span><button class="text-button" data-cancel>Cancel</button></header><section class="onboarding-shell"><div class="onboarding-intro"><p class="eyebrow">A considered start</p><h1>Let’s shape your next website.</h1><p>Answer a few useful questions. WebKiln prepares a deterministic, editable foundation without sending your project to an external AI provider.</p></div><form class="onboarding-card" data-onboarding-form><div data-onboarding-step="1"><p class="eyebrow">The basics</p><label class="field">What should we call it?<input required name="siteName" value="' +
    esc(session.user.displayName.split(' ')[0] + "'s website") +
    '" autofocus /></label><label class="field">Workspace<select required name="workspaceId" data-workspace-select><option>Loading workspaces…</option></select></label><label class="field">What are you building?<textarea name="description" rows="3" placeholder="A short description helps shape the starting copy."></textarea></label></div><div data-onboarding-step="2" hidden><p class="eyebrow">Direction</p><label class="field">Website type<select required name="websiteType"><option value="business">Business</option><option value="portfolio">Portfolio</option><option value="hosting">Hosting company</option><option value="restaurant">Restaurant</option><option value="events">Events</option><option value="ecommerce">Ecommerce</option><option value="blog">Blog</option><option value="community">Community</option><option value="personal">Personal</option><option value="documentation">Documentation</option><option value="landing">Landing page</option><option value="blank">Blank site</option></select></label><label class="field">Primary goal<select required name="goal"><option value="launch">Launch something</option><option value="sell">Sell a product or service</option><option value="showcase">Showcase work</option><option value="book">Get bookings</option><option value="publish">Publish content</option><option value="connect">Connect a community</option><option value="explain">Explain a product</option></select></label><p class="eyebrow">Choose a foundation</p><div class="onboarding-templates">' +
    templateCards +
    '</div></div><div data-onboarding-step="3" hidden><p class="eyebrow">Shape the first draft</p><div class="onboarding-page-choices" data-page-choices></div><label class="field">Visual style<select name="style"><option value="minimal">Minimal and calm</option><option value="technical">Technical and precise</option><option value="editorial">Editorial and expressive</option><option value="warm">Warm and welcoming</option></select></label><label class="field">Primary accent color<input type="color" name="primaryColor" value="#d6ad61" /></label></div><div data-onboarding-step="4" hidden><p class="eyebrow">Preview</p><h2 data-preview-title>One clear starting point.</h2><p data-preview-copy>Your site will be created with editable pages. Nothing is published until you choose Publish in the editor.</p><div class="onboarding-note">Template content is a starting point. You can change every page, token, component, and setting after creation.</div></div><p class="cloud-error" data-onboarding-error hidden></p><div class="onboarding-actions"><button class="ghost-btn" type="button" data-back hidden>Back</button><button class="primary-btn" type="button" data-next>Continue</button></div></form></section></main>';
  const form = document.querySelector<HTMLFormElement>('[data-onboarding-form]')!;
  const steps = [...document.querySelectorAll<HTMLElement>('[data-onboarding-step]')];
  const label = document.querySelector<HTMLElement>('[data-step-label]')!;
  const back = document.querySelector<HTMLButtonElement>('[data-back]')!;
  const next = document.querySelector<HTMLButtonElement>('[data-next]')!;
  const error = document.querySelector<HTMLElement>('[data-onboarding-error]')!;
  let step = 1;
  let workspaces: Workspace[] = [];
  const selectedTemplateId = () => String(new FormData(form).get('templateId') ?? 'blank');
  const renderPageChoices = () => {
    const template = templateById(selectedTemplateId());
    const target = document.querySelector<HTMLElement>('[data-page-choices]');
    if (!target) return;
    target.innerHTML = template.pages
      .map(
        (item) =>
          '<label class="check-row"><input type="checkbox" name="pages" value="' +
          esc(item.slug) +
          '" ' +
          (template.recommendedPages.includes(item.slug) ? 'checked' : '') +
          ' /><span><strong>' +
          esc(item.name) +
          '</strong><small>' +
          esc(item.slug) +
          '</small></span></label>',
      )
      .join('');
  };
  const updatePreview = () => {
    const data = new FormData(form);
    const template = templateById(String(data.get('templateId') ?? 'blank'));
    document.querySelector('[data-preview-title]')!.textContent =
      String(data.get('siteName') || 'Your website') + ' is ready to shape.';
    document.querySelector('[data-preview-copy]')!.textContent =
      template.name +
      ' includes ' +
      template.pages.length +
      ' editable starter pages, a ' +
      String(data.get('style') || 'minimal') +
      ' visual direction, and a ' +
      String(data.get('goal') || 'clear') +
      ' goal.';
  };
  try {
    workspaces = await cloud.listWorkspaces();
    const select = document.querySelector<HTMLSelectElement>('[data-workspace-select]')!;
    select.innerHTML = workspaces
      .map(
        (workspace) =>
          '<option value="' + esc(workspace.id) + '">' + esc(workspace.name) + '</option>',
      )
      .join('');
    if (!workspaces.length) throw new Error('Create a workspace before starting a website.');
  } catch (loadError) {
    error.textContent =
      loadError instanceof Error ? loadError.message : 'Could not load workspaces.';
    error.hidden = false;
    next.disabled = true;
  }
  const update = () => {
    steps.forEach((item) => {
      item.hidden = Number(item.dataset.onboardingStep) !== step;
    });
    label.textContent = 'Step ' + step + ' of 4';
    back.hidden = step === 1;
    next.textContent = step === 4 ? 'Create website' : 'Continue';
    if (step === 3) renderPageChoices();
    if (step === 4) updatePreview();
  };
  document
    .querySelectorAll<HTMLInputElement>('[name="templateId"]')
    .forEach((input) => input.addEventListener('change', renderPageChoices));
  form.addEventListener('input', () => {
    if (step === 4) updatePreview();
  });
  back.addEventListener('click', () => {
    step = Math.max(1, step - 1);
    update();
  });
  next.addEventListener('click', async () => {
    error.hidden = true;
    if (!form.reportValidity()) return;
    if (step < 4) {
      step += 1;
      update();
      return;
    }
    next.disabled = true;
    next.textContent = 'Creating…';
    const data = new FormData(form);
    const name = String(data.get('siteName') ?? '').trim();
    const workspaceId = String(data.get('workspaceId') ?? '');
    try {
      const site = await cloud.createSite(workspaceId, name);
      const template = templateById(String(data.get('templateId')));
      const selectedPages = data.getAll('pages').map(String);
      await cloud.saveProject(site.id, {
        project: createTemplateProject(template, site.id, name, {
          description: String(data.get('description') ?? '').trim(),
          businessType: String(data.get('websiteType') ?? template.websiteType),
          goal: String(data.get('goal') ?? template.goal),
          selectedPageSlugs: selectedPages,
          primaryColor: String(data.get('primaryColor') ?? ''),
          style: String(data.get('style') ?? 'minimal') as
            'editorial' | 'technical' | 'warm' | 'minimal',
        }),
        expectedRevision: site.currentRevision,
      });
      navigate('/editor/' + encodeURIComponent(site.id));
    } catch (createError) {
      error.textContent =
        createError instanceof Error ? createError.message : 'Could not create website.';
      error.hidden = false;
      next.disabled = false;
      next.textContent = 'Create website';
    }
  });
  document.querySelector('[data-cancel]')?.addEventListener('click', () => navigate('/dashboard'));
  renderPageChoices();
  update();
}
