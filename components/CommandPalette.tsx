'use client';

// CommandPalette — ⌘K / Ctrl+K from anywhere, or the nav's search pill.
//
// Two jobs in one box:
//   1. Find a role. Typing searches company + title through /api/jobs (both
//      tabs, debounced, the previous request aborted) and lists the newest
//      matches; Enter opens the application in a new tab, like a card does.
//   2. Go somewhere. Every board view a reader reaches for (a tab, the campus
//      view, remote, visa, new since last visit, density) plus theme, status and
//      the RSS feed for this view. These are plain URL changes: the palette
//      builds the same links the filter bar does, from the current URL.
//
// A native <dialog> opened with showModal(): focus is trapped, Esc closes, the
// rest of the page is inert. Focus stays in the input; the list is a listbox
// driven by aria-activedescendant, so arrow keys never leave the field.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE_EVENT } from '@/lib/palette';
import { resolvedTheme, setTheme } from '@/lib/theme';
import { ageText } from '@/lib/age';

type Role = {
  company: string;
  initials: string;
  logo: string | null;
  title: string;
  url: string;
  type: string;
  locations: string[];
  pay: string | null;
  postedAt: string;
};

type Item =
  | { kind: 'role'; id: string; role: Role }
  | { kind: 'action'; id: string; label: string; hint?: string; icon: string; run: () => void };

const TYPE_LABEL: Record<string, string> = { internship: 'Internship', new_grad: 'New grad' };

export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const timer = useRef<number>(undefined);
  const inflight = useRef<AbortController>(undefined);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // The URL's search string when the palette opened — every action is built
  // from it, the same way the filter bar builds its links.
  const [search, setSearch] = useState('');

  const show = useCallback(() => {
    const d = dialog.current;
    if (!d || d.open) return;
    setSearch(window.location.pathname === '/' ? window.location.search : '');
    setActive(0);
    d.showModal();
    setOpen(true);
  }, []);

  const hide = useCallback(() => dialog.current?.close(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (dialog.current?.open) hide();
        else show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, show);
    };
  }, [show, hide]);

  function onClosed() {
    setOpen(false);
    setQ('');
    setRoles([]);
    setLoading(false);
    window.clearTimeout(timer.current);
    inflight.current?.abort();
  }

  // Search as you type: debounced, and only the latest request may land.
  function onType(value: string) {
    setQ(value);
    setActive(0);
    window.clearTimeout(timer.current);
    inflight.current?.abort();
    const query = value.trim();
    if (query.length < 2) {
      setRoles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const ctl = new AbortController();
      inflight.current = ctl;
      const get = (type: string) =>
        fetch(`/api/jobs?type=${type}&limit=5&q=${encodeURIComponent(query)}`, {
          signal: ctl.signal,
        }).then((r) => (r.ok ? r.json() : { jobs: [] }));
      try {
        const [a, b] = await Promise.all([get('internship'), get('new_grad')]);
        const merged: Role[] = [...a.jobs, ...b.jobs]
          .sort((x: Role, y: Role) => y.postedAt.localeCompare(x.postedAt))
          .slice(0, 6);
        setNow(Math.floor(Date.now() / 1000));
        setRoles(merged);
        setLoading(false);
      } catch {
        if (!ctl.signal.aborted) {
          setRoles([]);
          setLoading(false);
        }
      }
    }, 160);
  }

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const params = new URLSearchParams(search);
    const href = (mut: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(search);
      mut(p);
      p.delete('n');
      const s = p.toString();
      return s ? `/?${s}` : '/';
    };
    const go = (to: string) => () => router.push(to);
    const flag = (key: string) => (p: URLSearchParams) => {
      if (p.get(key) === '1') p.delete(key);
      else p.set(key, '1');
    };
    const on = (key: string) => (params.get(key) === '1' ? 'On' : undefined);
    const type = params.get('type') ?? 'internship';
    const query = q.trim();

    const actions: Item[] = [
      { kind: 'action', id: 'a-intern', icon: '◐', label: 'Internships', hint: type === 'internship' ? 'Current' : undefined,
        run: go(href((p) => { p.set('type', 'internship'); p.delete('term'); })) },
      { kind: 'action', id: 'a-newgrad', icon: '◑', label: 'New grad roles', hint: type === 'new_grad' ? 'Current' : undefined,
        run: go(href((p) => { p.set('type', 'new_grad'); p.delete('term'); })) },
      { kind: 'action', id: 'a-campus', icon: '⌂', label: 'Seattle + remote — UW launchpad', hint: on('campus'), run: go(href(flag('campus'))) },
      { kind: 'action', id: 'a-remote', icon: '◎', label: 'Remote only', hint: on('remote'), run: go(href(flag('remote'))) },
      { kind: 'action', id: 'a-visa', icon: '✦', label: 'I need visa sponsorship', hint: on('visa'), run: go(href(flag('visa'))) },
      { kind: 'action', id: 'a-new', icon: '●', label: 'Only what’s new since my last visit', hint: on('new'), run: go(href(flag('new'))) },
      { kind: 'action', id: 'a-density', icon: '☰', label: params.get('d') === 'compact' ? 'Comfortable cards' : 'Compact cards',
        run: go(href((p) => { if (p.get('d') === 'compact') p.delete('d'); else p.set('d', 'compact'); })) },
      { kind: 'action', id: 'a-clear', icon: '↺', label: 'Clear all filters',
        run: go(href((p) => { for (const k of [...p.keys()]) if (k !== 'type' && k !== 'd') p.delete(k); })) },
      { kind: 'action', id: 'a-theme', icon: '◒', label: 'Toggle light / dark theme',
        run: () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark') },
      { kind: 'action', id: 'a-system', icon: '◌', label: 'Match system theme', run: () => setTheme('system') },
      { kind: 'action', id: 'a-status', icon: '≋', label: 'Source status', run: go('/status') },
      { kind: 'action', id: 'a-rss', icon: '⌁', label: 'RSS feed for this view',
        run: () => {
          const p = new URLSearchParams(search);
          for (const k of ['n', 'd', 'new']) p.delete(k);
          const s = p.toString();
          window.location.assign(s ? `/feed.xml?${s}` : '/feed.xml');
        } },
    ];

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = words.length
      ? actions.filter((a) => a.kind === 'action' && words.every((w) => a.label.toLowerCase().includes(w)))
      : actions;

    const out: Item[] = [];
    if (query) {
      out.push({
        kind: 'action',
        id: 'a-search',
        icon: '⌕',
        label: `Search the board for “${query}”`,
        hint: '↵',
        run: go(href((p) => p.set('q', query))),
      });
    }
    for (const r of roles) out.push({ kind: 'role', id: `r-${r.url}`, role: r });
    return [...out, ...matching];
  }, [open, search, q, roles, router]);

  const current = Math.min(active, Math.max(items.length - 1, 0));

  function choose(item: Item | undefined) {
    if (!item) return;
    if (item.kind === 'role') {
      window.open(item.role.url, '_blank', 'noopener,noreferrer');
      hide();
      return;
    }
    hide();
    item.run();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      const next =
        e.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
      setActive(next);
      list.current
        ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[current]);
    }
  }

  const roleStart = items.findIndex((i) => i.kind === 'role');
  const actionStart = items.findIndex((i, n) => i.kind === 'action' && (n > 0 || !q.trim()));

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Search roles and jump anywhere"
      onClose={onClosed}
      onClick={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="palette__panel glass">
        <div className="palette__field">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search companies and titles, or jump to a view…"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-list"
            aria-activedescendant={items[current] ? `palette-${items[current].id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
          />
          {loading && <span className="palette__spinner" aria-label="Searching" />}
          <kbd>esc</kbd>
        </div>

        <ul ref={list} id="palette-list" className="palette__list" role="listbox" aria-label="Results">
          {items.map((item, i) => {
            const heading =
              i === roleStart ? 'Roles' : i === actionStart ? 'Jump to' : undefined;
            return (
              <PaletteRow
                key={item.id}
                item={item}
                index={i}
                heading={heading}
                active={i === current}
                now={now}
                onHover={() => setActive(i)}
                onChoose={() => choose(item)}
              />
            );
          })}
          {open && q.trim().length >= 2 && !loading && roles.length === 0 && (
            <li className="palette__empty" role="presentation">
              No roles match “{q.trim()}” yet — search the board to widen it.
            </li>
          )}
        </ul>

        <div className="palette__foot" aria-hidden>
          <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </dialog>
  );
}

function PaletteRow({
  item,
  index,
  heading,
  active,
  now,
  onHover,
  onChoose,
}: {
  item: Item;
  index: number;
  heading?: string;
  active: boolean;
  now: number;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <>
      {heading && (
        <li className="palette__heading" role="presentation">
          {heading}
        </li>
      )}
      <li
        id={`palette-${item.id}`}
        role="option"
        aria-selected={active}
        data-index={index}
        className={item.kind === 'role' ? 'palette__item palette__item--role' : 'palette__item'}
        onMouseMove={active ? undefined : onHover}
        onClick={onChoose}
      >
        {item.kind === 'role' ? (
          <>
            <span className="mark mark--sm" aria-hidden>
              <span className="mark__mono">{item.role.initials}</span>
              {item.role.logo && (
                <span className="mark__img" style={{ backgroundImage: `url("${item.role.logo}")` }} />
              )}
            </span>
            <span className="palette__text">
              <span className="palette__title">{item.role.title}</span>
              <span className="palette__sub">
                {item.role.company} · {TYPE_LABEL[item.role.type] ?? 'Role'}
                {item.role.locations[0] ? ` · ${item.role.locations[0]}` : ''}
              </span>
            </span>
            <span className="palette__hint">
              {ageText(Math.floor(Date.parse(item.role.postedAt) / 1000), now)} ↗
            </span>
          </>
        ) : (
          <>
            <span className="palette__icon" aria-hidden>
              {item.icon}
            </span>
            <span className="palette__text">
              <span className="palette__title">{item.label}</span>
            </span>
            {item.hint && <span className="palette__hint">{item.hint}</span>}
          </>
        )}
      </li>
    </>
  );
}
