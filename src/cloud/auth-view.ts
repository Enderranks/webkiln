import type { WebKilnApiClient } from './api-client';
import { navigate } from './app-router';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

export async function renderAuthView(
  cloud: WebKilnApiClient,
  mode: 'login' | 'signup',
): Promise<void> {
  document.body.innerHTML =
    '<main class="cloud-app auth-app"><div class="auth-loading" role="status">Checking your session…</div></main>';
  try {
    const session = await cloud.getSession();
    if (session) {
      navigate('/dashboard');
      return;
    }
  } catch {
    // The form remains usable when session restoration is unavailable.
  }
  const isSignup = mode === 'signup';
  document.body.innerHTML = `
    <main class="cloud-app auth-app">
      <section class="auth-card" aria-labelledby="auth-title">
        <a class="cloud-brand" href="/" aria-label="WebKiln home"><span class="brand-mark">W</span><span>WEBKILN</span></a>
        <p class="eyebrow">${isSignup ? 'Start building' : 'Welcome back'}</p>
        <h1 id="auth-title">${isSignup ? 'Create your cloud workspace.' : 'Sign in to WebKiln.'}</h1>
        <p class="auth-copy">${isSignup ? 'Keep your sites safe, synced, and ready wherever you build.' : 'Open your sites, revisions, and editor workspace.'}</p>
        <form class="cloud-form" data-auth-form novalidate>
          ${isSignup ? '<label>Name<input name="name" autocomplete="name" required /></label>' : ''}
          <label>Email<input name="email" type="email" autocomplete="email" required /></label>
          <label>Password<input name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="8" required /></label>
          <p class="cloud-error" data-auth-error role="alert" hidden></p>
          <button class="primary-btn cloud-submit" type="submit">${isSignup ? 'Create account' : 'Sign in'}</button>
        </form>
        <p class="auth-switch">${isSignup ? 'Already have an account?' : 'New to WebKiln?'} <a href="${isSignup ? '/login' : '/signup'}">${isSignup ? 'Sign in' : 'Create an account'}</a></p>
        <a class="auth-local-link" href="/">Continue in local editor</a>
      </section>
    </main>`;
  const form = document.querySelector<HTMLFormElement>('[data-auth-form]');
  const errorBox = document.querySelector<HTMLElement>('[data-auth-error]');
  const submit = document.querySelector<HTMLButtonElement>('.cloud-submit');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    if (submit) {
      submit.disabled = true;
      submit.textContent = isSignup ? 'Creating…' : 'Signing in…';
    }
    if (errorBox) errorBox.hidden = true;
    try {
      const session = isSignup
        ? await cloud.signUp(
            String(values.get('name') ?? ''),
            String(values.get('email') ?? ''),
            String(values.get('password') ?? ''),
          )
        : await cloud.signIn(
            String(values.get('email') ?? ''),
            String(values.get('password') ?? ''),
          );
      navigate(session ? '/dashboard' : '/login');
    } catch (error) {
      if (errorBox) {
        errorBox.textContent = escapeHtml(
          error instanceof Error ? error.message : 'Authentication failed.',
        );
        errorBox.hidden = false;
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = isSignup ? 'Create account' : 'Sign in';
      }
    }
  });
}
