// MTA-STS policy. Served at https://mta-sts.<domain>/.well-known/mta-sts.txt via a
// rewrite (see next.config.mjs). Mode is "testing" (report-only) — switch to
// "enforce" only once the inbound MTA presents a valid TLS cert on port 25.
export const dynamic = 'force-dynamic';

export function GET() {
  const mailHost = process.env.MAIL_HOST ?? 'mail.inboxi.online';
  const body = ['version: STSv1', 'mode: testing', `mx: ${mailHost}`, 'max_age: 86400', ''].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
