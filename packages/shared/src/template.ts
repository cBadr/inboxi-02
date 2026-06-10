// Lightweight {{variable}} template engine for notification templates
// (Telegram / email / webhook). Supports dot-paths like {{message.subject}}
// and a fallback syntax {{ value | default text }}.

export type TemplateContext = Record<string, unknown>;

function resolvePath(ctx: TemplateContext, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
    const [rawPath, fallback] = expr.split('|').map((s) => s.trim());
    const value = resolvePath(ctx, rawPath ?? '');
    if (value == null || value === '') {
      return fallback ?? '';
    }
    return String(value);
  });
}

/** Extract the set of {{variables}} referenced by a template. */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)) {
    if (match[1]) found.add(match[1].trim());
  }
  return [...found];
}
