'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RichEditor, type RichEditorHandle } from './RichEditor';

type NameMode = 'single' | 'sequential' | 'random';
type SendMethod = 'all' | 'one' | 'groups';
const NAMES_STORAGE_KEY = 'inboxi.senderNames';
const SUBJECTS_STORAGE_KEY = 'inboxi.subjects';
const LETTERS_STORAGE_KEY = 'inboxi.letters';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

interface Recipient {
  email: string;
  vars?: Record<string, string>;
}
interface Attachment {
  filename: string;
  contentType?: string;
  contentBase64: string;
  size: number;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const TOTAL_ATTACHMENT_CAP = 7 * 1024 * 1024;
const SYSTEM_VARS = ['to', 'emailid', 'from', 'date', 'domain'];
const DYNAMIC_VARS: Array<{ token: string; hint: string }> = [
  { token: '{{random:6}}', hint: 'Random number with N digits (e.g. {{random:8}})' },
  { token: '{{md5}}', hint: 'Random MD5 hash (32 hex). {{md5:12}} for a shorter one' },
  { token: '{{uuid}}', hint: 'Random UUID v4 — unique per message (tracking/unsubscribe IDs)' },
  { token: '{{random_string:8}}', hint: 'Random alphanumeric token of N chars' },
  { token: '{{random_hex:16}}', hint: 'Random hex token of N chars' },
  { token: '{{random_name}}', hint: 'A random human first name' },
  { token: '{{datetime}}', hint: 'Current date & time' },
  { token: '{{year}}', hint: 'Current year' },
];

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s);
    };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function ComposeStudio({ domains }: { domains: string[] }) {
  const params = useSearchParams();
  // Reply/Forward prefill via query params (?from=&to=&subject=).
  const pFrom = params.get('from') ?? '';
  const pFromParts = pFrom.includes('@') ? pFrom.split('@') : null;
  const pTo = params.get('to') ?? '';
  const pSubject = params.get('subject') ?? '';

  const [local, setLocal] = useState(pFromParts ? pFromParts[0]! : '');
  const [domain, setDomain] = useState(
    pFromParts && domains.includes(pFromParts[1]!) ? pFromParts[1]! : domains[0] ?? '',
  );

  // From display name + rotation pool (pool persisted in localStorage).
  const [nameMode, setNameMode] = useState<NameMode>('single');
  const [fromNameSingle, setFromNameSingle] = useState('');
  const [namePool, setNamePool] = useState<string[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAMES_STORAGE_KEY);
      if (raw) setNamePool(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(namePool));
    } catch {
      /* ignore */
    }
  }, [namePool]);

  const addName = () => {
    const v = newName.trim();
    if (v && !namePool.includes(v)) setNamePool((p) => [...p, v]);
    setNewName('');
  };
  const [recipients, setRecipients] = useState<Recipient[]>(
    pTo && pTo.includes('@') ? [{ email: pTo.toLowerCase() }] : [],
  );
  const [varColumns, setVarColumns] = useState<string[]>([]);
  const [recipientsText, setRecipientsText] = useState('');
  const [showList, setShowList] = useState(false);

  const [subject, setSubject] = useState(pSubject);
  const [subjectMode, setSubjectMode] = useState<NameMode>('single');
  const [subjectPool, setSubjectPool] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUBJECTS_STORAGE_KEY);
      if (raw) setSubjectPool(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjectPool));
    } catch {
      /* ignore */
    }
  }, [subjectPool]);

  const addSubject = () => {
    const v = newSubject.trim();
    if (v && !subjectPool.includes(v)) setSubjectPool((p) => [...p, v]);
    setNewSubject('');
  };

  const [mode, setMode] = useState<'text' | 'html'>('html');
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);

  // Letter (body) rotation pool — persisted in localStorage.
  const [letterMode, setLetterMode] = useState<NameMode>('single');
  const [letterPool, setLetterPool] = useState<string[]>([]);
  const [newLetter, setNewLetter] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LETTERS_STORAGE_KEY);
      if (raw) setLetterPool(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LETTERS_STORAGE_KEY, JSON.stringify(letterPool));
    } catch {
      /* ignore */
    }
  }, [letterPool]);
  const addLetter = () => {
    const v = newLetter.trim();
    if (v && !letterPool.includes(v)) setLetterPool((p) => [...p, v]);
    setNewLetter('');
  };

  // Delivery throttling.
  const [sendMethod, setSendMethod] = useState<SendMethod>('all');
  const [groupSize, setGroupSize] = useState(10);
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(10);

  // Random-date inserter.
  const [rdFrom, setRdFrom] = useState('');
  const [rdTo, setRdTo] = useState('');

  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyTextRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const richHandle = useRef<RichEditorHandle | null>(null);
  const activeField = useRef<'subject' | 'body'>('body');

  const fromAddress = useMemo(() => `${local.trim() || 'hello'}@${domain}`, [local, domain]);
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const allVars = [...SYSTEM_VARS, ...varColumns];

  // Estimated completion time from the chosen delivery method + delays.
  const recipientCount = recipients.length;
  const numChunks =
    sendMethod === 'all'
      ? 1
      : sendMethod === 'one'
        ? recipientCount
        : Math.ceil(recipientCount / Math.max(1, groupSize));
  const lo = Math.max(0, Math.min(delayMin, delayMax));
  const hi = Math.max(delayMin, delayMax);
  const avgDelay = (lo + hi) / 2;
  const etaSeconds = Math.max(0, numChunks - 1) * avgDelay + recipientCount * 0.5;

  // ── recipients ──
  const mergeRecipients = (incoming: Recipient[], cols?: string[]) => {
    setRecipients((prev) => {
      const seen = new Set(prev.map((r) => r.email.toLowerCase()));
      const merged = [...prev];
      for (const r of incoming) {
        const key = r.email.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(r);
        }
      }
      return merged;
    });
    if (cols && cols.length) setVarColumns((p) => Array.from(new Set([...p, ...cols])));
  };

  const addFromText = (text: string) => {
    const found = text.match(EMAIL_RE) ?? [];
    if (found.length === 0) {
      setStatus({ ok: false, msg: 'No valid email addresses found.' });
      return;
    }
    mergeRecipients(found.map((email) => ({ email: email.toLowerCase() })));
    setRecipientsText('');
    setStatus({ ok: true, msg: `Added ${found.length} recipient(s).` });
  };

  const importCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return;
    const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
    const hasHeader = header.some((h) => /e-?mail/.test(h));
    let emailIdx = header.findIndex((h) => /e-?mail/.test(h));
    if (emailIdx < 0) emailIdx = 0;
    const cols = hasHeader ? header.filter((_, i) => i !== emailIdx) : [];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const parsed: Recipient[] = [];
    for (const line of dataLines) {
      const cells = parseCsvLine(line);
      const email = (cells[emailIdx] ?? '').match(EMAIL_RE)?.[0];
      if (!email) continue;
      const vars: Record<string, string> = {};
      if (hasHeader) {
        header.forEach((h, i) => {
          if (i !== emailIdx && cells[i] != null) vars[h] = cells[i]!;
        });
      }
      parsed.push({ email: email.toLowerCase(), vars: hasHeader ? vars : undefined });
    }
    if (parsed.length === 0) {
      setStatus({ ok: false, msg: 'No recipients found in CSV.' });
      return;
    }
    mergeRecipients(parsed, cols);
    setStatus({
      ok: true,
      msg: `Imported ${parsed.length} recipient(s)${cols.length ? ` + variables: ${cols.join(', ')}` : ''}.`,
    });
  };

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes(',') && /e-?mail/i.test(text.split(/\r?\n/)[0] ?? '')) importCsv(text);
      else addFromText(text);
    } catch {
      setStatus({ ok: false, msg: 'Clipboard access denied — paste into the box instead.' });
    }
  };

  const onRecipientFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith('.csv') || /e-?mail/i.test(text.split(/\r?\n/)[0] ?? '')) importCsv(text);
    else addFromText(text);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeRecipient = (email: string) =>
    setRecipients((prev) => prev.filter((r) => r.email !== email));

  // ── variables ──
  const insertRaw = (token: string) => {
    if (activeField.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, start) + token + subject.slice(end));
      return;
    }
    if (mode === 'text' && bodyTextRef.current) {
      const el = bodyTextRef.current;
      const start = el.selectionStart ?? bodyText.length;
      const end = el.selectionEnd ?? bodyText.length;
      setBodyText(bodyText.slice(0, start) + token + bodyText.slice(end));
      return;
    }
    richHandle.current?.insert(token);
  };
  const insertVar = (name: string) => insertRaw(`{{${name}}}`);
  const insertRandomDate = () => insertRaw(rdFrom && rdTo ? `{{randomdate:${rdFrom}:${rdTo}}}` : '{{randomdate}}');

  // ── attachments ──
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const added: Attachment[] = [];
    let running = totalSize;
    for (const file of picked) {
      if (running + file.size > TOTAL_ATTACHMENT_CAP) {
        setStatus({ ok: false, msg: `Attachments exceed ${fmtSize(TOTAL_ATTACHMENT_CAP)} limit.` });
        break;
      }
      added.push({
        filename: file.name,
        contentType: file.type || undefined,
        contentBase64: await readFileAsBase64(file),
        size: file.size,
      });
      running += file.size;
    }
    setFiles((p) => [...p, ...added]);
    e.target.value = '';
  };

  // ── import message body from file ──
  const onImportMessage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith('.html') || /<[a-z][\s\S]*>/i.test(text)) {
      setMode('html');
      setBodyHtml(text);
    } else {
      setMode('text');
      setBodyText(text);
    }
    setStatus({ ok: true, msg: `Loaded message from ${file.name}.` });
    e.target.value = '';
  };

  // Build the shared payload (everything except recipients + indexOffset).
  const buildBase = (): Record<string, unknown> | string => {
    const base: Record<string, unknown> = { from: fromAddress, format: mode };
    // subject
    if (subjectMode === 'single') {
      if (subject) base.subject = subject;
    } else if (subjectPool.length > 0) {
      base.subjectMode = subjectMode;
      base.subjects = subjectPool;
    }
    // from name
    if (nameMode === 'single') {
      if (fromNameSingle.trim()) base.fromName = fromNameSingle.trim();
    } else if (namePool.length > 0) {
      base.fromNameMode = nameMode;
      base.fromNames = namePool;
    }
    // body / letters
    if (letterMode === 'single') {
      const body = mode === 'html' ? bodyHtml : bodyText;
      if (!body.trim()) return 'Write a message first.';
      base[mode] = body;
    } else {
      if (letterPool.length === 0) return 'Add at least one letter to the pool.';
      base.letterMode = letterMode;
      base.letters = letterPool;
    }
    if (files.length) {
      base.attachments = files.map((f) => ({
        filename: f.filename,
        contentType: f.contentType,
        contentBase64: f.contentBase64,
      }));
    }
    return base;
  };

  const post = (payload: Record<string, unknown>) =>
    fetch('/api/mail/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

  // ── send ──
  const submit = async () => {
    setStatus(null);
    setProgress(null);
    if (recipients.length === 0) {
      setStatus({ ok: false, msg: 'Add at least one recipient.' });
      return;
    }
    const base = buildBase();
    if (typeof base === 'string') {
      setStatus({ ok: false, msg: base });
      return;
    }
    const recs = recipients.map((r) => ({ email: r.email, vars: r.vars }));

    // Scheduled campaigns go out as a single batch at the chosen time.
    if (scheduleMode === 'later') {
      if (!scheduleAt) return setStatus({ ok: false, msg: 'Pick a date & time to schedule.' });
      const at = new Date(scheduleAt);
      if (at.getTime() <= Date.now())
        return setStatus({ ok: false, msg: 'Scheduled time must be in the future.' });
      setLoading(true);
      try {
        const res = await post({ ...base, recipients: recs, scheduleAt: at.toISOString() });
        const data = await res.json();
        setStatus(
          res.ok && data.scheduled
            ? { ok: true, msg: `Scheduled ${recs.length} message(s) for ${new Date(data.at).toLocaleString()}.` }
            : { ok: false, msg: humanError(data.error) },
        );
      } catch {
        setStatus({ ok: false, msg: 'Network error — please try again.' });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Build chunks per delivery method.
    let chunks: typeof recs[] = [];
    if (sendMethod === 'all') chunks = [recs];
    else if (sendMethod === 'one') chunks = recs.map((r) => [r]);
    else {
      const g = Math.max(1, groupSize);
      for (let i = 0; i < recs.length; i += g) chunks.push(recs.slice(i, i + g));
    }

    cancelRef.current = false;
    setLoading(true);
    let offset = 0;
    let sent = 0;
    let failed = 0;
    setProgress({ sent: 0, failed: 0, total: recs.length });
    try {
      for (let ci = 0; ci < chunks.length; ci++) {
        if (cancelRef.current) {
          setStatus({ ok: true, msg: `Stopped. Sent ${sent}/${recs.length}.` });
          break;
        }
        const chunk = chunks[ci]!;
        try {
          const res = await post({ ...base, recipients: chunk, indexOffset: offset });
          const data = await res.json();
          if (res.ok) {
            sent += data.sent ?? 0;
            failed += data.failed ?? 0;
            if (data.blocked) {
              setProgress({ sent, failed, total: recs.length });
              setStatus({ ok: false, msg: `Stopped — quota or spam filter. Sent ${sent}/${recs.length}.` });
              break;
            }
          } else {
            failed += chunk.length;
          }
        } catch {
          failed += chunk.length;
        }
        offset += chunk.length;
        setProgress({ sent, failed, total: recs.length });

        if (ci < chunks.length - 1 && !cancelRef.current) {
          const delay = (lo + Math.random() * (hi - lo)) * 1000;
          const remainingChunks = chunks.length - ci - 1;
          setStatus({
            ok: true,
            msg: `Sent ${sent}/${recs.length} — next in ${Math.round(delay / 1000)}s · ~${fmtDuration(remainingChunks * avgDelay)} left`,
          });
          await sleep(delay);
        }
      }
      if (!cancelRef.current) {
        setStatus({
          ok: sent > 0,
          msg: `Done — sent ${sent}/${recs.length}${failed ? ` · ${failed} failed` : ''}.`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* From */}
      <Section title="From">
        <div className="flex items-stretch overflow-hidden rounded-lg border focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
          <input
            value={local}
            onChange={(e) => setLocal(e.target.value.replace(/\s+/g, ''))}
            placeholder="hello"
            className="min-w-0 flex-1 px-3 py-2 font-mono text-sm outline-none"
          />
          <span className="flex items-center bg-gray-50 px-2 font-mono text-sm text-gray-400">@</span>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="border-l bg-gray-50 px-2 py-2 font-mono text-sm text-gray-700 outline-none"
          >
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLocal('{{randmail}}')}
            className="rounded-lg border px-2.5 py-1 text-xs text-gray-600 transition hover:border-brand hover:text-brand"
          >
            🎲 Random sender
          </button>
          {local === '{{randmail}}' && (
            <span className="text-xs text-amber-600">
              A fresh random address is generated per message.
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">
            Sending as <span className="font-mono text-gray-500">{fromAddress}</span>
          </span>
        </div>
      </Section>

      {/* From name */}
      <Section title="From name" hint="Shown as the sender's display name">
        <div className="mb-3 flex flex-wrap gap-2">
          {(['single', 'sequential', 'random'] as NameMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setNameMode(m)}
              className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition ${nameMode === m ? 'border-brand bg-brand/5 text-brand' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {m === 'single' ? 'Single' : m === 'sequential' ? 'Rotate in order' : 'Random'}
            </button>
          ))}
        </div>

        {nameMode === 'single' ? (
          <input
            value={fromNameSingle}
            onChange={(e) => setFromNameSingle(e.target.value)}
            placeholder="e.g. Inboxi Team — supports {{variables}}"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        ) : (
          <div>
            <div className="mb-2 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addName())}
                placeholder="Add a name to the pool…"
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={addName}
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white hover:bg-brand-dark"
              >
                Add
              </button>
            </div>
            {namePool.length === 0 ? (
              <p className="text-xs text-gray-400">
                No names yet — add a few. They&apos;re saved in this browser and{' '}
                {nameMode === 'sequential' ? 'rotated in order' : 'picked at random'} per message.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {namePool.map((n) => (
                  <li
                    key={n}
                    className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs"
                  >
                    <span className="text-gray-700">{n}</span>
                    <button
                      type="button"
                      onClick={() => setNamePool((p) => p.filter((x) => x !== n))}
                      className="text-gray-300 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11px] text-gray-400">{namePool.length} name(s) in pool</p>
          </div>
        )}
      </Section>

      {/* Recipients */}
      <Section title={`Recipients${recipients.length ? ` · ${recipients.length}` : ''}`}>
        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" onClick={pasteClipboard} className={toolBtn}>
            📋 Paste from clipboard
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={toolBtn}>
            📄 Import CSV / text
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={onRecipientFile}
            className="hidden"
          />
          {recipients.length > 0 && (
            <>
              <button type="button" onClick={() => setShowList((v) => !v)} className={toolBtn}>
                {showList ? 'Hide list' : 'Show list'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecipients([]);
                  setVarColumns([]);
                }}
                className="rounded-lg border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Clear
              </button>
            </>
          )}
        </div>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          onBlur={() => recipientsText.trim() && addFromText(recipientsText)}
          rows={2}
          placeholder="Paste or type emails (comma / space / newline separated), then click away to add…"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {varColumns.length > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            Detected variables from import:{' '}
            {varColumns.map((c) => (
              <code key={c} className="mr-1 rounded bg-gray-100 px-1 text-gray-600">{`{{${c}}}`}</code>
            ))}
          </p>
        )}
        {showList && recipients.length > 0 && (
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-gray-50 p-2">
            {recipients.map((r) => (
              <li key={r.email} className="flex items-center justify-between text-xs">
                <span className="font-mono text-gray-600">{r.email}</span>
                <button
                  type="button"
                  onClick={() => removeRecipient(r.email)}
                  className="text-gray-300 hover:text-red-500"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Variables palette */}
      <Section title="Variables" hint="Click to insert into the focused field (subject or message)">
        <div className="flex flex-wrap gap-1.5">
          {allVars.map((v) => (
            <button
              key={v}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertVar(v)}
              className="rounded-full border bg-white px-2.5 py-1 font-mono text-xs text-brand transition hover:bg-brand/5"
            >{`{{${v}}}`}</button>
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Dynamic — generated fresh per message
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DYNAMIC_VARS.map((d) => (
              <button
                key={d.token}
                type="button"
                title={d.hint}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertRaw(d.token)}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-xs text-amber-700 transition hover:bg-amber-100"
              >
                {d.token}
              </button>
            ))}
            <span className="ml-1 text-[11px] text-gray-400">
              tip: <code className="font-mono">{`{{random:6}}`}</code> →{' '}
              <code className="font-mono">{`{{random:N}}`}</code> for N digits
            </span>
          </div>
        </div>

        {/* Random date inserter */}
        <div className="mt-3 rounded-lg border bg-gray-50/50 p-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-xs text-amber-700">
              {'{{randomdate}}'}
            </span>
            <span className="text-[11px] text-gray-400">A random date in a range → e.g. “1st July 2026”.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-gray-500">From</label>
            <input
              type="date"
              value={rdFrom}
              onChange={(e) => setRdFrom(e.target.value)}
              className="rounded border px-2 py-1 text-xs"
            />
            <label className="text-[11px] text-gray-500">To</label>
            <input
              type="date"
              value={rdTo}
              onChange={(e) => setRdTo(e.target.value)}
              className="rounded border px-2 py-1 text-xs"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertRandomDate}
              className="rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark"
            >
              Insert random date
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          <code className="font-mono">{`{{emailid}}`}</code> = the part of the recipient&apos;s address before the @.
        </p>
      </Section>

      {/* Subject */}
      <Section title="Subject" hint="One subject, or rotate a pool per message">
        <div className="mb-3 flex flex-wrap gap-2">
          {(['single', 'sequential', 'random'] as NameMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSubjectMode(m)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${subjectMode === m ? 'border-brand bg-brand/5 text-brand' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {m === 'single' ? 'Single' : m === 'sequential' ? 'Rotate in order' : 'Random'}
            </button>
          ))}
        </div>

        {subjectMode === 'single' ? (
          <input
            ref={subjectRef}
            value={subject}
            onFocus={() => (activeField.current = 'subject')}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject — supports {{variables}}"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        ) : (
          <div>
            <div className="mb-2 flex gap-2">
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubject())}
                placeholder="Add a subject to the pool — supports {{variables}}…"
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={addSubject}
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white hover:bg-brand-dark"
              >
                Add
              </button>
            </div>
            {subjectPool.length === 0 ? (
              <p className="text-xs text-gray-400">
                No subjects yet — add a few. They&apos;re saved in this browser and{' '}
                {subjectMode === 'sequential' ? 'rotated in order' : 'picked at random'} per message.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {subjectPool.map((s) => (
                  <li
                    key={s}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-gray-700">{s}</span>
                    <button
                      type="button"
                      onClick={() => setSubjectPool((p) => p.filter((x) => x !== s))}
                      className="shrink-0 text-gray-300 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11px] text-gray-400">{subjectPool.length} subject(s) in pool</p>
          </div>
        )}
      </Section>

      {/* Message */}
      <Section title="Message">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`rounded px-2.5 py-1 transition ${mode === 'text' ? 'bg-brand text-white' : 'text-gray-500'}`}
            >
              Plain
            </button>
            <button
              type="button"
              onClick={() => setMode('html')}
              className={`rounded px-2.5 py-1 transition ${mode === 'html' ? 'bg-brand text-white' : 'text-gray-500'}`}
            >
              Rich / HTML
            </button>
          </div>
          <label className={`${toolBtn} cursor-pointer`}>
            ⬆ Import from .html / .txt
            <input
              type="file"
              accept=".html,.htm,.txt,text/html,text/plain"
              onChange={onImportMessage}
              className="hidden"
            />
          </label>
        </div>

        {/* letter rotation mode */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">Letters:</span>
          {(['single', 'sequential', 'random'] as NameMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setLetterMode(m)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${letterMode === m ? 'border-brand bg-brand/5 text-brand' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {m === 'single' ? 'Single' : m === 'sequential' ? 'Rotate in order' : 'Random'}
            </button>
          ))}
        </div>

        {letterMode === 'single' ? (
          mode === 'html' ? (
            <RichEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              handleRef={(h) => (richHandle.current = h)}
              onFocus={() => (activeField.current = 'body')}
              placeholder="Write your message — use the toolbar and insert {{variables}}…"
            />
          ) : (
            <textarea
              ref={bodyTextRef}
              value={bodyText}
              onFocus={() => (activeField.current = 'body')}
              onChange={(e) => setBodyText(e.target.value)}
              rows={12}
              placeholder="Write your plain-text message — supports {{variables}}…"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          )
        ) : (
          <div>
            <div className="mb-2 flex gap-2">
              <textarea
                value={newLetter}
                onChange={(e) => setNewLetter(e.target.value)}
                rows={3}
                placeholder={`Add a ${mode === 'html' ? 'HTML' : 'plain-text'} letter to the pool — supports {{variables}}…`}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand ${mode === 'html' ? 'font-mono' : ''}`}
              />
              <button type="button" onClick={addLetter} className="self-start rounded-lg bg-brand px-3 py-2 text-sm text-white hover:bg-brand-dark">
                Add
              </button>
            </div>
            {letterPool.length === 0 ? (
              <p className="text-xs text-gray-400">
                No letters yet. They&apos;re saved in this browser and{' '}
                {letterMode === 'sequential' ? 'rotated in order' : 'picked at random'} per recipient.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {letterPool.map((l, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-gray-600">
                      {l.length > 200 ? `${l.slice(0, 200)}…` : l}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLetterPool((p) => p.filter((_, j) => j !== i))}
                      className="shrink-0 text-gray-300 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11px] text-gray-400">{letterPool.length} letter(s) in pool · format: {mode}</p>
          </div>
        )}
      </Section>

      {/* Attachments */}
      <Section title="Attachments" hint={files.length ? `${fmtSize(totalSize)} / ${fmtSize(TOTAL_ATTACHMENT_CAP)}` : `max ${fmtSize(TOTAL_ATTACHMENT_CAP)}`}>
        <input id="compose-files" type="file" multiple onChange={onPickFiles} className="hidden" />
        <label htmlFor="compose-files" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm text-gray-600 hover:border-brand hover:text-brand">
          📎 Attach files
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-700">{f.filename}</span>
                <span className="shrink-0 text-xs text-gray-400">{fmtSize(f.size)}</span>
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Delivery */}
      <Section title="Delivery" hint={recipientCount > 0 ? `est. ~${fmtDuration(etaSeconds)} to finish` : undefined}>
        {/* method */}
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">Sending method</div>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All at once'],
              ['one', 'One by one'],
              ['groups', 'Groups'],
            ] as Array<[SendMethod, string]>).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => setSendMethod(m)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${sendMethod === m ? 'border-brand bg-brand/5 text-brand' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {lbl}
              </button>
            ))}
            {sendMethod === 'groups' && (
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                of
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={groupSize}
                  onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border px-2 py-1 text-sm"
                />
                each
              </label>
            )}
          </div>
        </div>

        {/* random delay (one-by-one / groups) */}
        {sendMethod !== 'all' && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50/50 p-2.5 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Random delay</span>
            <input
              type="number"
              min={0}
              max={3600}
              value={delayMin}
              onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded border px-2 py-1"
            />
            <span className="text-gray-400">to</span>
            <input
              type="number"
              min={0}
              max={3600}
              value={delayMax}
              onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded border px-2 py-1"
            />
            <span className="text-gray-500">seconds between {sendMethod === 'one' ? 'sends' : 'groups'}</span>
          </div>
        )}

        {/* schedule */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="sched" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} />
            Send now
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="sched" checked={scheduleMode === 'later'} onChange={() => setScheduleMode('later')} />
            Schedule
          </label>
          {scheduleMode === 'later' && (
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          )}
        </div>
        {recipientCount > 0 && scheduleMode === 'now' && (
          <p className="mt-2 text-xs text-gray-500">
            {sendMethod === 'all'
              ? `Sending all ${recipientCount} at once.`
              : `Sending in ${numChunks} ${sendMethod === 'one' ? 'individual sends' : 'groups'} — estimated ~${fmtDuration(etaSeconds)} to finish.`}
          </p>
        )}
      </Section>

      {/* Send */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={loading || !domain}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
          >
            {loading
              ? progress
                ? `Sending… ${progress.sent + progress.failed}/${progress.total}`
                : 'Working…'
              : scheduleMode === 'later'
                ? `Schedule${recipientCount ? ` (${recipientCount})` : ''}`
                : `Send now${recipientCount ? ` (${recipientCount})` : ''}`}
          </button>
          {loading && progress && (
            <button
              type="button"
              onClick={() => (cancelRef.current = true)}
              className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Stop
            </button>
          )}
          <span className="text-xs text-gray-400">DKIM-signed · TLS · per-recipient variables</span>
          {status && (
            <span className={`ml-auto text-sm ${status.ok ? 'text-green-600' : 'text-red-600'}`}>
              {status.msg}
            </span>
          )}
        </div>

        {progress && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${Math.round(((progress.sent + progress.failed) / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {progress.sent} sent · {progress.failed} failed · {progress.total} total
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const toolBtn =
  'rounded-lg border bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:border-brand hover:text-brand';

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case 'from_domain_not_available':
    case 'unknown_from_domain':
      return 'You can only send from a domain you control.';
    case 'send_quota_exceeded':
      return 'Daily send quota reached.';
    case 'invalid_payload':
      return 'Some fields are invalid — check recipients and message.';
    default:
      return code ? `Failed: ${code}` : 'Failed to send.';
  }
}
