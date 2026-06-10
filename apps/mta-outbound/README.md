# @inboxi/mta-outbound

Haraka outbound MTA — the **self-host delivery driver**. Listens for local
submissions on `127.0.0.1:587` and relays them to the internet over port 25.

```
web app (SELF_HOST transport, nodemailer)
   --> 127.0.0.1:587 (this Haraka, relay ACL = loopback only)
   --> internet :25
```

## When it's used

The web delivery layer (`packages/integrations/delivery`) picks a transport per
domain. Configure a `DeliveryTransport` of type `SELF_HOST` with
`smtpHost=127.0.0.1`, `smtpPort=587` to route a domain's outbound through here.
DKIM is already applied by the web app before submission.

## Prerequisites (production)

- **Outbound port 25 must be open** (DigitalOcean blocks it by default — open a
  support ticket, or run this on a provider/IP that allows it).
- The sending IP needs good reputation: valid PTR (`mail.inboxi.online`),
  SPF/DKIM/DMARC aligned, and **not** on DNSBLs. Until then, prefer the external
  SMTP relay driver. (Note: `67.205.130.18` is currently listed on Spamhaus —
  request delisting + warm the IP before self-sending.)

## Run

```bash
pnpm --filter @inboxi/mta-outbound start   # haraka -c .
```

Runs under systemd in production (`infra/systemd/haraka-outbound.service`).
