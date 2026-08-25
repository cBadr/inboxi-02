import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Serve a stored attachment's bytes. Authorization: admins may fetch any
// attachment; regular users only attachments on messages in their own
// mailboxes. Images are served inline (for thumbnails); everything else as a
// download. Append ?download=1 to force a download for any type.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id },
    include: { message: { include: { mailbox: { select: { userId: true } } } } },
  });
  if (!attachment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isAdmin = user.roleName === 'admin';
  const owns = attachment.message.mailbox?.userId === user.id;
  if (!isAdmin && !owns) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!attachment.content) {
    return NextResponse.json({ error: 'content_unavailable' }, { status: 404 });
  }

  const declaredType = attachment.contentType ?? 'application/octet-stream';
  const baseType = declaredType.split(';')[0]?.trim().toLowerCase() ?? '';

  // An SVG is an image/* that can carry <script>, and this endpoint is on our
  // own origin — served inline it is stored XSS with the reader's session
  // attached. Same for any markup type. These are handed over as opaque bytes,
  // never rendered.
  const NEVER_INLINE = new Set([
    'image/svg+xml',
    'image/svg',
    'text/html',
    'text/xml',
    'application/xml',
    'application/xhtml+xml',
    'text/javascript',
    'application/javascript',
  ]);
  const renderable = declaredType.startsWith('image/') && !NEVER_INLINE.has(baseType);

  const forceDownload = req.nextUrl.searchParams.get('download') === '1';
  const disposition = renderable && !forceDownload ? 'inline' : 'attachment';
  const contentType = NEVER_INLINE.has(baseType) ? 'application/octet-stream' : declaredType;
  const safeName = attachment.filename.replace(/[^\w.\-() ]+/g, '_');

  return new NextResponse(new Uint8Array(attachment.content), {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `${disposition}; filename="${safeName}"`,
      'content-length': String(attachment.content.length),
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      // Belt and braces: even if a type slips past the list above, this
      // response can load nothing and run nothing.
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
