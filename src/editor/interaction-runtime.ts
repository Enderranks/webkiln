import type { InteractionAction, InteractionDefinition } from '../types';
import { normalizeInteractions } from '../models/interaction-schema';

function targetFor(root: Document, selector: string): HTMLElement | null {
  if (!selector) return null;
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function applyAction(root: Document, action: InteractionAction, reducedMotion: boolean): void {
  const element = targetFor(root, action.target ?? '');
  if (!element) return;
  if (reducedMotion && action.reducedMotion === 'skip') return;
  const duration = reducedMotion ? 0 : action.duration;
  const easing = action.easing;
  if (action.type === 'show') element.hidden = false;
  if (action.type === 'hide') element.hidden = true;
  if (action.type === 'toggle-class' && typeof action.value === 'string')
    element.classList.toggle(action.value);
  if (action.type === 'open-modal' || action.type === 'open-drawer') {
    element.hidden = false;
    element.setAttribute('aria-hidden', 'false');
    element.setAttribute('data-wk-open', 'true');
  }
  if (action.type === 'expand-accordion') {
    if (element instanceof HTMLDetailsElement) element.open = true;
    element.setAttribute('aria-expanded', 'true');
  }
  if (action.type === 'scroll-to')
    element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  if (
    action.type === 'opacity' ||
    action.type === 'translate' ||
    action.type === 'scale' ||
    action.type === 'rotate' ||
    action.type === 'color'
  ) {
    element.style.transition = `all ${duration}ms ${easing}`;
    if (action.type === 'opacity') element.style.opacity = String(action.value ?? 1);
    if (action.type === 'translate')
      element.style.transform = `translate(${String(action.value ?? '0, 0')})`;
    if (action.type === 'scale') element.style.transform = `scale(${String(action.value ?? 1)})`;
    if (action.type === 'rotate')
      element.style.transform = `rotate(${String(action.value ?? '0deg')})`;
    if (action.type === 'color') element.style.color = String(action.value ?? '');
  }
  if (action.type === 'counter') {
    const end = Number(action.value ?? element.textContent ?? 0);
    const start = performance.now();
    const tick = (now: number) => {
      const ratio = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      element.textContent = String(Math.round(end * ratio));
      if (ratio < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  if (action.type === 'media-play' || action.type === 'media-pause') {
    const media =
      element instanceof HTMLMediaElement ? element : element.querySelector('video, audio');
    if (media instanceof HTMLMediaElement) {
      if (action.type === 'media-play') void media.play().catch(() => undefined);
      else media.pause();
    }
  }
}

function runInteraction(root: Document, interaction: InteractionDefinition): void {
  const reducedMotion =
    root.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
  const runs = interaction.loop.enabled
    ? Math.max(1, Math.min(10, interaction.loop.count ?? 2))
    : 1;
  for (let run = 0; run < runs; run += 1) {
    interaction.actions.forEach((action, index) => {
      const offset =
        interaction.sequence === 'sequence'
          ? interaction.actions
              .slice(0, index)
              .reduce((sum, item) => sum + item.duration + item.delay, 0)
          : 0;
      window.setTimeout(
        () => applyAction(root, action, reducedMotion),
        offset + action.delay + run * interaction.loop.delay,
      );
    });
  }
}

export function installInteractionRuntime(root: Document, definitions: unknown): () => void {
  const interactions = normalizeInteractions(definitions).filter((item) => item.enabled);
  const cleanups: Array<() => void> = [];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      interactions
        .filter(
          (item) => item.trigger === (entry.isIntersecting ? 'enter-viewport' : 'leave-viewport'),
        )
        .forEach((item) => runInteraction(root, item));
    });
  });
  interactions.forEach((interaction) => {
    const element = targetFor(root, interaction.target);
    if (!element) return;
    if (interaction.trigger === 'enter-viewport' || interaction.trigger === 'leave-viewport')
      observer.observe(element);
    if (interaction.trigger === 'page-load') runInteraction(root, interaction);
    if (interaction.trigger === 'click')
      element.addEventListener('click', () => runInteraction(root, interaction));
    if (interaction.trigger === 'hover')
      element.addEventListener('pointerenter', () => runInteraction(root, interaction));
    if (interaction.trigger === 'focus')
      element.addEventListener('focus', () => runInteraction(root, interaction));
    if (interaction.trigger === 'form-success')
      element.addEventListener('webkiln:form-success', () => runInteraction(root, interaction));
    cleanups.push(() => observer.unobserve(element));
  });
  const scrollInteractions = interactions.filter((item) => item.trigger === 'scroll-position');
  const onScroll = () => {
    const position = root.defaultView?.scrollY ?? 0;
    scrollInteractions
      .filter((item) => position >= (item.scrollPosition ?? 100))
      .forEach((item) => runInteraction(root, item));
  };
  const breakpointInteractions = interactions.filter(
    (item) => item.trigger === 'breakpoint-change',
  );
  const onResize = () => breakpointInteractions.forEach((item) => runInteraction(root, item));
  root.defaultView?.addEventListener('scroll', onScroll, { passive: true });
  root.defaultView?.addEventListener('resize', onResize);
  cleanups.push(() => root.defaultView?.removeEventListener('scroll', onScroll));
  cleanups.push(() => root.defaultView?.removeEventListener('resize', onResize));
  root.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
    const close = () => dialog.close();
    dialog
      .querySelectorAll<HTMLElement>('[aria-label*="Close"], [data-close]')
      .forEach((button) => button.addEventListener('click', close));
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && root.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && root.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeydown);
    cleanups.push(() => dialog.removeEventListener('keydown', onKeydown));
  });
  cleanups.push(() => observer.disconnect());
  return () => cleanups.forEach((cleanup) => cleanup());
}
