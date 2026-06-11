import { TempInbox } from '@/components/TempInbox';
import { AdSlot } from '@/components/AdSlot';
import { Reveal } from '@/components/Reveal';
import { CountUp } from '@/components/CountUp';
import { SocialLinks } from '@/components/SocialLinks';
import { PartnersMarquee } from '@/components/PartnersMarquee';
import { getHomeContent, type Feature } from '@/lib/home-content';

export const dynamic = 'force-dynamic';

// CMS-customisable marketing homepage. All copy comes from `cms.home`
// (Admin → CMS → Homepage) with rich defaults, so it always renders.
export default async function HomePage() {
  const c = await getHomeContent();

  // Group features into columns by category (preserving first-seen order).
  const featureColumns: Array<{ title: string; items: Feature[] }> = [];
  for (const f of c.features.items) {
    const cat = f.category || 'Features';
    let col = featureColumns.find((x) => x.title === cat);
    if (!col) {
      col = { title: cat, items: [] };
      featureColumns.push(col);
    }
    col.items.push(f);
  }

  return (
    <div className="overflow-hidden">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative bg-hero-mesh">
        {/* floating accent blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[8%] top-24 h-40 w-40 animate-float rounded-full bg-brand/20 blur-3xl" />
          <div className="absolute right-[10%] top-40 h-52 w-52 animate-float rounded-full bg-accent/20 blur-3xl [animation-delay:-3s]" />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
          {/* copy */}
          <div>
            <Reveal>
              <span className="inline-flex items-center rounded-full border border-brand/20 bg-white/70 px-3 py-1 text-xs font-medium text-brand backdrop-blur">
                {c.hero.badge}
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                {c.hero.title}{' '}
                <span className="text-gradient">{c.hero.highlight}</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">{c.hero.subtitle}</p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href={c.hero.primaryCta.href}
                  className="cta-shine inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-dark"
                >
                  {c.hero.primaryCta.label} <span aria-hidden>→</span>
                </a>
                <a
                  href={c.hero.secondaryCta.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white/70 px-6 py-3 text-base font-semibold text-gray-700 backdrop-blur transition hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand"
                >
                  {c.hero.secondaryCta.label}
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <p className="mt-4 text-sm text-gray-500">{c.hero.trustNote}</p>
            </Reveal>
          </div>

          {/* live inbox widget */}
          <Reveal delay={120}>
            <div id="inbox" className="scroll-mt-24">
              <TempInbox />
            </div>
          </Reveal>
        </div>

        {/* trust bar */}
        <div className="border-y border-white/60 bg-white/40 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-4 text-sm text-gray-500">
            {c.trustBar.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="text-brand">✓</span> {t}
              </span>
            ))}
          </div>
        </div>

        {/* partners marquee */}
        <PartnersMarquee heading={c.partnersHeading} partners={c.partners} />
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{c.features.heading}</h2>
          <p className="mt-3 text-lg text-gray-600">{c.features.subheading}</p>
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {featureColumns.map((col, ci) => (
            <Reveal key={col.title} delay={ci * 90}>
              <div className="h-full rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand">{col.title}</span>
                  <span className="text-xs text-gray-300">{col.items.length}</span>
                </div>
                <ul className="space-y-1">
                  {col.items.map((f) => (
                    <li key={f.title} className="group/feat rounded-xl px-2 py-2 transition hover:bg-brand/5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand/10 to-accent/10 text-lg transition group-hover/feat:scale-110">
                          {f.icon}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-gray-900">{f.title}</span>
                        {f.tier && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              f.tier === 'free' ? 'bg-green-100 text-green-700' : 'bg-brand/10 text-brand'
                            }`}
                          >
                            {f.tier}
                          </span>
                        )}
                      </div>
                      {/* hover-reveal details */}
                      <div className="grid grid-rows-[0fr] transition-all duration-300 group-hover/feat:grid-rows-[1fr]">
                        <p className="overflow-hidden pl-12 text-xs leading-relaxed text-gray-500 opacity-0 transition-opacity duration-300 group-hover/feat:pt-1 group-hover/feat:opacity-100">
                          {f.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="border-y bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{c.steps.heading}</h2>
            <p className="mt-3 text-lg text-gray-600">{c.steps.subheading}</p>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {c.steps.items.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <div className="relative rounded-2xl border bg-gray-50/60 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-brand to-brand-dark">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-14 lg:grid-cols-4">
          {c.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="text-center text-white">
              <div className="text-4xl font-extrabold tracking-tight">
                <CountUp value={s.value} />
              </div>
              <div className="mt-1 text-sm text-white/70">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Free perks (marketing the free tier) ───────────── */}
      <section className="border-y bg-gradient-to-br from-green-50/60 via-white to-brand/5">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              ✓ Free, forever
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {c.freePerks.heading}
            </h2>
            <p className="mt-3 text-lg text-gray-600">{c.freePerks.subheading}</p>
            <a
              href={c.freePerks.cta.href}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-green-600/20 transition hover:-translate-y-0.5 hover:bg-green-700"
            >
              {c.freePerks.cta.label} <span aria-hidden>→</span>
            </a>
          </Reveal>
          <Reveal delay={120}>
            <ul className="space-y-3 rounded-2xl border bg-white p-6 shadow-sm">
              {c.freePerks.items.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-700">
                    ✓
                  </span>
                  <span className="text-sm text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── Pricing CTA ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <div className="cta-aurora rounded-3xl border bg-white/70 p-10 text-center shadow-lg backdrop-blur sm:p-14">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{c.pricingCta.heading}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-700">{c.pricingCta.subheading}</p>
            <a
              href={c.pricingCta.cta.href}
              className="cta-shine mt-7 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-dark"
            >
              {c.pricingCta.cta.label} <span aria-hidden>→</span>
            </a>
            <p className="mt-3 text-sm text-gray-500">{c.pricingCta.note}</p>
          </div>
        </Reveal>
      </section>

      {/* ── Ad slot (optional, CMS-managed) ────────────────── */}
      <div className="mx-auto max-w-3xl px-4">
        <AdSlot zone="home_top" />
      </div>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{c.faq.heading}</h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {c.faq.items.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <details className="group rounded-xl border bg-white p-5 transition hover:border-brand/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-gray-900">
                  {f.q}
                  <span className="shrink-0 text-brand transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────── */}
      <section className="cta-aurora border-t bg-gradient-to-br from-white to-brand/5">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{c.finalCta.heading}</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600">{c.finalCta.subheading}</p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <a
                href={c.finalCta.primaryCta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-dark"
              >
                {c.finalCta.primaryCta.label} <span aria-hidden>→</span>
              </a>
              <a
                href={c.finalCta.secondaryCta.href}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand"
              >
                {c.finalCta.secondaryCta.label}
              </a>
            </div>
            <SocialLinks socials={c.socials} className="mt-8 justify-center" />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
