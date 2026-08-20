'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
// Deliberately the subpath, not the package barrel: the barrel re-exports
// temp-address, which imports node:crypto, and webpack cannot bundle that into
// a client component.
import { gtmShouldLoad } from '@inboxi/shared/google';

/**
 * Renders the Google Tag Manager container configured in Admin -> Google.
 *
 * Mounted from the root layout, which also wraps /admin and /dashboard — so the
 * path check lives here. By default the container is not loaded on those
 * signed-in surfaces: measuring your own console sessions pollutes the numbers
 * you are reading, and it puts third-party tag code on pages that render
 * customer mail.
 *
 * `containerId` is already validated against the GTM-XXXX shape server-side, so
 * it is safe to interpolate into the loader.
 */
export function GoogleTagManager({
  containerId,
  includeAppPages,
}: {
  containerId: string;
  includeAppPages: boolean;
}) {
  const pathname = usePathname();
  if (!gtmShouldLoad(pathname ?? '/', includeAppPages)) return null;

  return (
    <>
      <Script id="gtm-init" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${containerId}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${containerId}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}
