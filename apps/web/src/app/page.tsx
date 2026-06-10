import { TempInbox } from '@/components/TempInbox';
import { AdSlot } from '@/components/AdSlot';

// The landing page is the top of the conversion funnel. The anonymous temp
// address is provisioned by the TempInbox client on mount (via a Route Handler
// that can set the session cookie), so the page itself stays static.
export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Your temporary inbox is ready</h1>
        <p className="mt-3 text-gray-600">
          No signup needed. Receive your first emails instantly — register to keep them and unlock
          more.
        </p>
      </section>

      <TempInbox />

      <div className="mt-8">
        <AdSlot zone="home_top" />
      </div>
    </div>
  );
}
