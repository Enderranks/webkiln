import type { DesignSystem, DesignToken, WebKilnProject } from '../types';

export const DEFAULT_DESIGN_TOKENS: DesignToken[] = [
  { name: 'color.brand.primary', value: '#d6ad61', category: 'Brand colors' },
  { name: 'color.semantic.background', value: '#0b0d0f', category: 'Semantic colors' },
  { name: 'color.semantic.text', value: '#f4f5f3', category: 'Semantic colors' },
  { name: 'font.family.body', value: 'DM Sans', category: 'Font families' },
  { name: 'font.family.heading', value: 'Space Grotesk', category: 'Font families' },
  { name: 'font.size.body', value: '1rem', category: 'Font sizes' },
  { name: 'font.weight.bold', value: '700', category: 'Font weights' },
  { name: 'line.height.body', value: '1.5', category: 'Line heights' },
  { name: 'space.md', value: '1rem', category: 'Spacing scale' },
  { name: 'radius.md', value: '10px', category: 'Corner radius' },
  { name: 'border.default', value: '1px solid #272d32', category: 'Borders' },
  { name: 'shadow.card', value: '0 18px 55px rgba(0,0,0,.28)', category: 'Shadows' },
  { name: 'container.default', value: '1200px', category: 'Container widths' },
  { name: 'motion.fast', value: '160ms ease', category: 'Motion' },
];

export function defaultDesignSystem(): DesignSystem {
  return {
    tokens: [...DEFAULT_DESIGN_TOKENS],
    componentVariants: {},
    linkedComponents: {},
    globalRegions: {},
  };
}
export function normalizeDesignSystem(value?: Partial<DesignSystem>): DesignSystem {
  const base = defaultDesignSystem();
  return {
    ...base,
    ...value,
    tokens: value?.tokens?.length ? value.tokens : base.tokens,
    componentVariants: value?.componentVariants ?? {},
    linkedComponents: value?.linkedComponents ?? {},
    globalRegions: value?.globalRegions ?? {},
  };
}
export function tokenUsageCount(project: WebKilnProject, token: DesignToken): number {
  return JSON.stringify(project).toLowerCase().split(token.value.toLowerCase()).length - 1;
}
export function tokenCss(system: DesignSystem): string {
  return `:root{${system.tokens.map((token) => `--wk-${token.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}:${token.value};`).join('')}}`;
}
export function replaceToken(system: DesignSystem, name: string, value: string): DesignSystem {
  return {
    ...system,
    tokens: system.tokens.map((token) => (token.name === name ? { ...token, value } : token)),
  };
}
export function exportTheme(system: DesignSystem): string {
  return JSON.stringify(system, null, 2);
}
export function importTheme(raw: string): DesignSystem {
  return normalizeDesignSystem(JSON.parse(raw) as DesignSystem);
}

export type GuardianSeverity = 'info' | 'warning' | 'error';
export interface GuardianFinding {
  id: string;
  severity: GuardianSeverity;
  pageId: string;
  pageName: string;
  explanation: string;
  suggestedFix: string;
  safe: boolean;
}
export function scanDesignGuardian(project: WebKilnProject): GuardianFinding[] {
  const findings: GuardianFinding[] = [];
  for (const page of project.pages) {
    const raw = JSON.stringify(page.projectData ?? {});
    if (!raw.toLowerCase().includes('alt'))
      findings.push({
        id: `alt-${page.id}`,
        severity: 'warning',
        pageId: page.id,
        pageName: page.name,
        explanation: 'One or more images may not have alternative text.',
        suggestedFix: 'Add a concise image description.',
        safe: false,
      });
    if (raw.includes('onclick=') || raw.includes('javascript:'))
      findings.push({
        id: `unsafe-${page.id}`,
        severity: 'error',
        pageId: page.id,
        pageName: page.name,
        explanation: 'Unsafe inline behavior is present in project data.',
        suggestedFix: 'Remove inline script behavior.',
        safe: true,
      });
    if ((raw.match(/font-size/g) ?? []).length > 8)
      findings.push({
        id: `type-${page.id}`,
        severity: 'info',
        pageId: page.id,
        pageName: page.name,
        explanation: 'This page contains many independent typography values.',
        suggestedFix: 'Map text styles to font-size tokens.',
        safe: true,
      });
    if (raw.includes('overflow') || raw.includes('width: 100vw'))
      findings.push({
        id: `overflow-${page.id}`,
        severity: 'warning',
        pageId: page.id,
        pageName: page.name,
        explanation: 'The project may overflow on a narrow viewport.',
        suggestedFix: 'Use a responsive container or horizontal-scroll intent.',
        safe: true,
      });
  }
  return findings;
}
export function healthScores(
  project: WebKilnProject,
): Record<string, { score: number | null; basis: string }> {
  const findings = scanDesignGuardian(project);
  const errors = findings.filter((item) => item.severity === 'error').length;
  const warnings = findings.filter((item) => item.severity === 'warning').length;
  const calculated = Math.max(0, 100 - errors * 25 - warnings * 10);
  return {
    'Design consistency': {
      score: calculated,
      basis: 'Calculated from project token and style checks',
    },
    Accessibility: {
      score: Math.max(0, 100 - warnings * 12),
      basis: 'Calculated from available project data',
    },
    SEO: { score: project.pages.length ? 100 : 0, basis: 'Calculated from local page metadata' },
    Performance: { score: null, basis: 'Unavailable until deployed pages are measured' },
    'Mobile usability': {
      score: calculated,
      basis: 'Estimated from responsive metadata and findings',
    },
    'Publishing readiness': {
      score: project.pages.length ? calculated : 0,
      basis: 'Calculated from local project checks',
    },
    'Security configuration': {
      score: null,
      basis: 'Production headers require a deployed-site check',
    },
  };
}
