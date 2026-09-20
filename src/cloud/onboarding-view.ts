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
  document.body.innerHTML = `<main class="cloud-app onboarding-app"><header class="cloud-topbar"><a class="cloud-brand" href="/dashboard"><span class="brand-mark">W</span><span>WEBKILN</span></a><span class="onboarding-step" data-step-label>Step 1 of 3</span><button class="text-button" data-cancel>Cancel</button></header><section class="onboarding-shell"><div class="onboarding-intro"><p class="eyebrow">A considered start</p><h1>Let’s shape your next website.</h1><p>Choose a foundation, name your site, and WebKiln will prepare editable pages you can refine in the visual editor.</p></div><form class="onboarding-card" data-onboarding-form><div data-onboarding-step="1"><label class="field">What should we call it?<input required name="siteName" value="${esc(`${session.user.displayName.split(' ')[0]}'s website`)}" autofocus /></label><label class="field">Workspace<select required name="workspaceId" data-workspace-select><option>Loading workspaces…</option></select></label></div><div data-onboarding-step="2" hidden><p class="eyebrow">Choose a foundation</p><div class="onboarding-templates">${WEBKILN_TEMPLATES.map((template) => `<label class="onboarding-template"><input type="radio" name="templateId" value="${template.id}" ${template.id === selectedTemplate ? 'checked' : ''}/><span><strong>${esc(template.name)}</strong><small>${esc(template.description)}</small><em>${esc(template.category)} · ${template.pages.length} page${template.pages.length === 1 ? '' : 's'}</em></span></label>`).join('')}</div></div><div data-onboarding-step="3" hidden><p class="eyebrow">Ready to build</p><h2>One clear starting point.</h2><p>Your site will be created with editable pages. Nothing is published until you choose Publish in the editor.</p><div class="onboarding-note">Template content is a starting point. You can change every page, token, component, and setting after creation.</div></div><p class="cloud-error" data-onboarding-error hidden></p><div class="onboarding-actions"><button class="ghost-btn" type="button" data-back hidden>Back</button><button class="primary-btn" type="button" data-next>Continue</button></div></form></section></main>`;
  const form = document.querySelector<HTMLFormElement>('[data-onboarding-form]')!;
  const steps = [...document.querySelectorAll<HTMLElement>('[data-onboarding-step]')];
  const label = document.querySelector<HTMLElement>('[data-step-label]')!;
  const back = document.querySelector<HTMLButtonElement>('[data-back]')!;
  const next = document.querySelector<HTMLButtonElement>('[data-next]')!;
  const error = document.querySelector<HTMLElement>('[data-onboarding-error]')!;
  let step = 1;
  let workspaces: Workspace[] = [];
  try {
    workspaces = await cloud.listWorkspaces();
    const select = document.querySelector<HTMLSelectElement>('[data-workspace-select]')!;
    select.innerHTML = workspaces
      .map((workspace) => `<option value="${esc(workspace.id)}">${esc(workspace.name)}</option>`)
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
    label.textContent = `Step ${step} of 3`;
    back.hidden = step === 1;
    next.textContent = step === 3 ? 'Create website' : 'Continue';
  };
  back.addEventListener('click', () => {
    step = Math.max(1, step - 1);
    update();
  });
  next.addEventListener('click', async () => {
    error.hidden = true;
    if (!form.reportValidity()) return;
    if (step < 3) {
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
      await cloud.saveProject(site.id, {
        project: createTemplateProject(template, site.id, name),
        expectedRevision: site.currentRevision,
      });
      navigate(`/editor/${encodeURIComponent(site.id)}`);
    } catch (createError) {
      error.textContent =
        createError instanceof Error ? createError.message : 'Could not create website.';
      error.hidden = false;
      next.disabled = false;
      next.textContent = 'Create website';
    }
  });
  document.querySelector('[data-cancel]')?.addEventListener('click', () => navigate('/dashboard'));
  update();
}
