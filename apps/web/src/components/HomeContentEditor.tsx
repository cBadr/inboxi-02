'use client';

import { useState, useActionState } from 'react';
import { saveHomeContent, type ActionResult } from '@/app/admin/module-actions';
import type { HomeContent } from '@/lib/home-content';

const input = 'w-full rounded border px-2 py-1.5 text-sm';
const label = 'block text-xs font-medium text-gray-500';

function Field({
  label: l,
  value,
  onChange,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className={label}>{l}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={`mt-1 ${input}`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1 ${input}`} />
      )}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border bg-white" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800">{title}</summary>
      <div className="space-y-3 border-t px-4 py-4">{children}</div>
    </details>
  );
}

export function HomeContentEditor({ initial }: { initial: HomeContent }) {
  const [c, setC] = useState<HomeContent>(initial);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveHomeContent, null);

  // generic immutable updater by path
  const up = (fn: (draft: HomeContent) => void) =>
    setC((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="content" value={JSON.stringify(c)} />

      <Section title="Hero">
        <Field label="Badge" value={c.hero.badge} onChange={(v) => up((d) => void (d.hero.badge = v))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" value={c.hero.title} onChange={(v) => up((d) => void (d.hero.title = v))} />
          <Field label="Highlight (gradient)" value={c.hero.highlight} onChange={(v) => up((d) => void (d.hero.highlight = v))} />
        </div>
        <Field label="Subtitle" value={c.hero.subtitle} textarea onChange={(v) => up((d) => void (d.hero.subtitle = v))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary CTA label" value={c.hero.primaryCta.label} onChange={(v) => up((d) => void (d.hero.primaryCta.label = v))} />
          <Field label="Primary CTA link" value={c.hero.primaryCta.href} onChange={(v) => up((d) => void (d.hero.primaryCta.href = v))} />
          <Field label="Secondary CTA label" value={c.hero.secondaryCta.label} onChange={(v) => up((d) => void (d.hero.secondaryCta.label = v))} />
          <Field label="Secondary CTA link" value={c.hero.secondaryCta.href} onChange={(v) => up((d) => void (d.hero.secondaryCta.href = v))} />
        </div>
        <Field label="Trust note" value={c.hero.trustNote} onChange={(v) => up((d) => void (d.hero.trustNote = v))} />
      </Section>

      <Section title="Trust bar (chips)">
        <ListEditor
          items={c.trustBar}
          onAdd={() => up((d) => void d.trustBar.push('New item'))}
          onRemove={(i) => up((d) => void d.trustBar.splice(i, 1))}
          render={(item, i) => (
            <input value={item} onChange={(e) => up((d) => void (d.trustBar[i] = e.target.value))} className={input} />
          )}
        />
      </Section>

      <Section title="Partners marquee (under trust bar)">
        <Field label="Heading" value={c.partnersHeading} onChange={(v) => up((d) => void (d.partnersHeading = v))} />
        <ListEditor
          items={c.partners}
          onAdd={() => up((d) => void d.partners.push({ name: 'Partner', logo: '', desc: '', url: '' }))}
          onRemove={(i) => up((d) => void d.partners.splice(i, 1))}
          render={(item, i) => (
            <div className="grid flex-1 gap-1.5 sm:grid-cols-2">
              <input value={item.name} onChange={(e) => up((d) => void (d.partners[i]!.name = e.target.value))} className={input} placeholder="name" />
              <input value={item.url} onChange={(e) => up((d) => void (d.partners[i]!.url = e.target.value))} className={input} placeholder="https://site.com" />
              <input value={item.logo} onChange={(e) => up((d) => void (d.partners[i]!.logo = e.target.value))} className={input} placeholder="logo image URL" />
              <input value={item.desc} onChange={(e) => up((d) => void (d.partners[i]!.desc = e.target.value))} className={input} placeholder="short description" />
            </div>
          )}
        />
      </Section>

      <Section title="Features">
        <Field label="Heading" value={c.features.heading} onChange={(v) => up((d) => void (d.features.heading = v))} />
        <Field label="Subheading" value={c.features.subheading} onChange={(v) => up((d) => void (d.features.subheading = v))} />
        <ListEditor
          items={c.features.items}
          onAdd={() => up((d) => void d.features.items.push({ icon: '✨', title: 'New feature', desc: '' }))}
          onRemove={(i) => up((d) => void d.features.items.splice(i, 1))}
          render={(item, i) => (
            <div className="grid flex-1 gap-2 sm:grid-cols-[60px_1fr]">
              <input value={item.icon} onChange={(e) => up((d) => void (d.features.items[i]!.icon = e.target.value))} className={input} placeholder="icon" />
              <div className="space-y-1">
                <input value={item.title} onChange={(e) => up((d) => void (d.features.items[i]!.title = e.target.value))} className={input} placeholder="title" />
                <input value={item.desc} onChange={(e) => up((d) => void (d.features.items[i]!.desc = e.target.value))} className={input} placeholder="description" />
                <div className="flex gap-2">
                  <input value={item.category ?? ''} onChange={(e) => up((d) => void (d.features.items[i]!.category = e.target.value))} className={input} placeholder="category (column)" />
                  <select
                    value={item.tier ?? ''}
                    onChange={(e) => up((d) => void (d.features.items[i]!.tier = (e.target.value || undefined) as 'free' | 'pro' | undefined))}
                    className={`${input} w-24`}
                  >
                    <option value="">—</option>
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        />
      </Section>

      <Section title="How it works (steps)">
        <Field label="Heading" value={c.steps.heading} onChange={(v) => up((d) => void (d.steps.heading = v))} />
        <Field label="Subheading" value={c.steps.subheading} onChange={(v) => up((d) => void (d.steps.subheading = v))} />
        <ListEditor
          items={c.steps.items}
          onAdd={() => up((d) => void d.steps.items.push({ title: 'New step', desc: '' }))}
          onRemove={(i) => up((d) => void d.steps.items.splice(i, 1))}
          render={(item, i) => (
            <div className="flex-1 space-y-1">
              <input value={item.title} onChange={(e) => up((d) => void (d.steps.items[i]!.title = e.target.value))} className={input} placeholder="title" />
              <input value={item.desc} onChange={(e) => up((d) => void (d.steps.items[i]!.desc = e.target.value))} className={input} placeholder="description" />
            </div>
          )}
        />
      </Section>

      <Section title="Stats">
        <ListEditor
          items={c.stats}
          onAdd={() => up((d) => void d.stats.push({ value: '0', label: 'New stat' }))}
          onRemove={(i) => up((d) => void d.stats.splice(i, 1))}
          render={(item, i) => (
            <div className="flex flex-1 gap-2">
              <input value={item.value} onChange={(e) => up((d) => void (d.stats[i]!.value = e.target.value))} className={`${input} w-24`} placeholder="value" />
              <input value={item.label} onChange={(e) => up((d) => void (d.stats[i]!.label = e.target.value))} className={input} placeholder="label" />
            </div>
          )}
        />
      </Section>

      <Section title="Free perks">
        <Field label="Heading" value={c.freePerks.heading} onChange={(v) => up((d) => void (d.freePerks.heading = v))} />
        <Field label="Subheading" value={c.freePerks.subheading} textarea onChange={(v) => up((d) => void (d.freePerks.subheading = v))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CTA label" value={c.freePerks.cta.label} onChange={(v) => up((d) => void (d.freePerks.cta.label = v))} />
          <Field label="CTA link" value={c.freePerks.cta.href} onChange={(v) => up((d) => void (d.freePerks.cta.href = v))} />
        </div>
        <ListEditor
          items={c.freePerks.items}
          onAdd={() => up((d) => void d.freePerks.items.push('New perk'))}
          onRemove={(i) => up((d) => void d.freePerks.items.splice(i, 1))}
          render={(item, i) => (
            <input value={item} onChange={(e) => up((d) => void (d.freePerks.items[i] = e.target.value))} className={input} />
          )}
        />
      </Section>

      <Section title="Social links">
        <p className="text-xs text-gray-400">
          Supported icons: twitter, telegram, github, instagram, facebook, youtube, discord, tiktok,
          linkedin. Leave a URL blank to hide that icon.
        </p>
        <ListEditor
          items={c.socials}
          onAdd={() => up((d) => void d.socials.push({ platform: 'twitter', url: '' }))}
          onRemove={(i) => up((d) => void d.socials.splice(i, 1))}
          render={(item, i) => (
            <div className="flex flex-1 gap-2">
              <input value={item.platform} onChange={(e) => up((d) => void (d.socials[i]!.platform = e.target.value))} className={`${input} w-32`} placeholder="platform" />
              <input value={item.url} onChange={(e) => up((d) => void (d.socials[i]!.url = e.target.value))} className={input} placeholder="https://…" />
            </div>
          )}
        />
      </Section>

      <Section title="Pricing CTA">
        <Field label="Heading" value={c.pricingCta.heading} onChange={(v) => up((d) => void (d.pricingCta.heading = v))} />
        <Field label="Subheading" value={c.pricingCta.subheading} textarea onChange={(v) => up((d) => void (d.pricingCta.subheading = v))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CTA label" value={c.pricingCta.cta.label} onChange={(v) => up((d) => void (d.pricingCta.cta.label = v))} />
          <Field label="CTA link" value={c.pricingCta.cta.href} onChange={(v) => up((d) => void (d.pricingCta.cta.href = v))} />
        </div>
        <Field label="Note" value={c.pricingCta.note} onChange={(v) => up((d) => void (d.pricingCta.note = v))} />
      </Section>

      <Section title="FAQ">
        <Field label="Heading" value={c.faq.heading} onChange={(v) => up((d) => void (d.faq.heading = v))} />
        <ListEditor
          items={c.faq.items}
          onAdd={() => up((d) => void d.faq.items.push({ q: 'New question?', a: '' }))}
          onRemove={(i) => up((d) => void d.faq.items.splice(i, 1))}
          render={(item, i) => (
            <div className="flex-1 space-y-1">
              <input value={item.q} onChange={(e) => up((d) => void (d.faq.items[i]!.q = e.target.value))} className={input} placeholder="question" />
              <textarea value={item.a} onChange={(e) => up((d) => void (d.faq.items[i]!.a = e.target.value))} rows={2} className={input} placeholder="answer" />
            </div>
          )}
        />
      </Section>

      <Section title="Final CTA & footer">
        <Field label="Heading" value={c.finalCta.heading} onChange={(v) => up((d) => void (d.finalCta.heading = v))} />
        <Field label="Subheading" value={c.finalCta.subheading} textarea onChange={(v) => up((d) => void (d.finalCta.subheading = v))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary CTA label" value={c.finalCta.primaryCta.label} onChange={(v) => up((d) => void (d.finalCta.primaryCta.label = v))} />
          <Field label="Primary CTA link" value={c.finalCta.primaryCta.href} onChange={(v) => up((d) => void (d.finalCta.primaryCta.href = v))} />
          <Field label="Secondary CTA label" value={c.finalCta.secondaryCta.label} onChange={(v) => up((d) => void (d.finalCta.secondaryCta.label = v))} />
          <Field label="Secondary CTA link" value={c.finalCta.secondaryCta.href} onChange={(v) => up((d) => void (d.finalCta.secondaryCta.href = v))} />
        </div>
        <Field label="Footer tagline" value={c.footerTagline} onChange={(v) => up((d) => void (d.footerTagline = v))} />
      </Section>

      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-white/90 py-3 backdrop-blur">
        <button
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save homepage'}
        </button>
        <a href="/" target="_blank" rel="noreferrer" className="text-sm text-gray-500 hover:text-brand">
          Preview homepage ↗
        </a>
        {state?.ok && <span className="text-sm text-green-600">Saved ✓</span>}
        {state && !state.ok && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

function ListEditor<T>({
  items,
  onAdd,
  onRemove,
  render,
}: {
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border bg-gray-50/50 p-2">
          {render(item, i)}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="shrink-0 rounded px-1.5 py-1 text-gray-300 hover:text-red-500"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-gray-500 hover:border-brand hover:text-brand">
        + Add
      </button>
    </div>
  );
}
