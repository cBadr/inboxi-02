import { MESSAGE_IFRAME_SANDBOX, buildMessageSrcDoc, linkifyPlainText } from '@inboxi/shared';

// The one place a received message's body is rendered. Both the user inbox and
// the admin inbox go through here so the safety rules — scripts neutralised,
// no referrer leaked, every link escaping to a new tab — can never drift apart
// between the two screens.
export function MessageBody({ html, text }: { html: string | null; text: string | null }) {
  if (html) {
    return (
      <iframe
        title="Message body"
        // No allow-scripts and no allow-same-origin: the mail stays inert and
        // cannot reach this origin. allow-popups is what lets its links open in
        // a new tab instead of navigating inside this frame.
        sandbox={MESSAGE_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        className="h-[60vh] w-full rounded-lg border bg-white"
        srcDoc={buildMessageSrcDoc(html)}
      />
    );
  }

  if (text) {
    return (
      <div
        className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800 [&_a:hover]:underline [&_a]:text-brand"
        // linkifyPlainText escapes the body before it linkifies it, so nothing
        // the sender wrote can reach the DOM as markup.
        dangerouslySetInnerHTML={{ __html: linkifyPlainText(text) }}
      />
    );
  }

  return <p className="text-sm italic text-gray-400">(no content)</p>;
}
