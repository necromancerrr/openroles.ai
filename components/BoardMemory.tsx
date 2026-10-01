'use client';

// BoardMemory — the board's one piece of per-reader memory, and its keyboard.
//
//   1. Visit. Keeps the `or_visit` cookie current (lib/visit.ts) so the server
//      can draw "new since your last visit" across the whole result set.
//   2. Opened. Remembers which postings this browser opened — in localStorage,
//      keyed by canonical URL, never sent anywhere — and marks those cards, the
//      way a mail client marks what you've read. A daily scanner's second
//      question, after "what's new", is "which of these did I already look at".
//   3. Keys. `/` focuses search; `j` / `k` step through the cards; Enter opens
//      one (it's a link — that part needed no code).
//   4. Light. The card under a mouse pointer gets a soft spotlight that follows
//      it: one delegated pointermove, at most one style write per frame, and
//      only for fine pointers.
//
// It only ever sets data-* attributes and CSS custom properties on
// server-rendered cards. It never adds or removes nodes React owns, which is
// what keeps it safe across RSC navigations. Everything is wrapped for storage that throws (private mode,
// blocked site data): the board must work exactly the same without it.

import { useCallback, useEffect, useState } from 'react';
import { VISIT_COOKIE, parseVisit, visitCookieValue } from '@/lib/visit';

const OPENED_KEY = 'or:opened'; // { [canonicalKey]: unix seconds }
const HIDE_KEY = 'or:hide-opened';
const MAX_OPENED = 3000;
const OPENED_SUFFIX = ' You opened this before.';

function readOpened(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPENED_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function remember(key: string) {
  try {
    const opened = readOpened();
    opened[key] = Math.floor(Date.now() / 1000);
    let entries = Object.entries(opened);
    if (entries.length > MAX_OPENED) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_OPENED);
    }
    localStorage.setItem(OPENED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* no storage: nothing is remembered, nothing breaks */
  }
}

function touchVisit() {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${VISIT_COOKIE}=([^;]*)`));
    const current = m ? decodeURIComponent(m[1]) : undefined;
    const value = visitCookieValue(parseVisit(current), Math.floor(Date.now() / 1000));
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${VISIT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
  } catch {
    /* cookies blocked: the board just never says "since your last visit" */
  }
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function BoardMemory({ renderedAt }: { renderedAt: number }) {
  const [openedHere, setOpenedHere] = useState(0);
  const [hide, setHide] = useState(false);

  // Mark every opened card in the current window. Runs after each server
  // render (renderedAt changes), since a new filter means new cards.
  const decorate = useCallback(() => {
    const opened = readOpened();
    let n = 0;
    document.querySelectorAll<HTMLAnchorElement>('a.card[data-key]').forEach((card) => {
      const label = card.getAttribute('aria-label') ?? '';
      if (opened[card.dataset.key ?? '']) {
        n++;
        card.dataset.opened = '1';
        if (!label.endsWith(OPENED_SUFFIX)) card.setAttribute('aria-label', label + OPENED_SUFFIX);
      } else if (card.dataset.opened) {
        delete card.dataset.opened;
        card.setAttribute('aria-label', label.replace(OPENED_SUFFIX, ''));
      }
    });
    setOpenedHere(n);
  }, []);

  // 1. Visit: now, and again whenever the reader leaves — "last visit" should
  // mean the last time they were looking, not the last time they clicked.
  useEffect(() => {
    touchVisit();
    const onHide = () => {
      if (document.visibilityState === 'hidden') touchVisit();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', touchVisit);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', touchVisit);
    };
  }, [renderedAt]);

  // 2. Opened: decorate this render's cards, and catch every way a card gets
  // opened — click, Enter (a click event on a link), middle-click.
  useEffect(() => {
    // Next frame: the cards this render committed are laid out by then, and
    // the count lands as a callback from the DOM rather than a render cascade.
    const frame = requestAnimationFrame(decorate);
    return () => cancelAnimationFrame(frame);
  }, [renderedAt, decorate]);

  useEffect(() => {
    const onOpen = (e: MouseEvent) => {
      if (e.type === 'auxclick' && e.button !== 1) return;
      const card = (e.target as Element | null)?.closest?.('a.card[data-key]');
      if (!(card instanceof HTMLAnchorElement) || !card.dataset.key) return;
      remember(card.dataset.key);
      // After the new tab has had its moment — restyling the card mid-click
      // reads as a glitch.
      window.setTimeout(decorate, 400);
    };
    document.addEventListener('click', onOpen);
    document.addEventListener('auxclick', onOpen);
    return () => {
      document.removeEventListener('click', onOpen);
      document.removeEventListener('auxclick', onOpen);
    };
  }, [decorate]);

  useEffect(() => {
    try {
      // Reading storage after mount is the point: the server can't know it,
      // and the first client render has to match the server's.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHide(localStorage.getItem(HIDE_KEY) === '1');
    } catch {
      /* default: show everything */
    }
  }, []);

  useEffect(() => {
    document.querySelector('.grid')?.toggleAttribute('data-hide-opened', hide);
  }, [hide, renderedAt]);

  // 3. Keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === '/') {
        const input = document.querySelector<HTMLInputElement>('.search__input');
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }
      if (e.key !== 'j' && e.key !== 'k') return;
      // Visible cards only — "hide opened" takes some out of the sequence.
      const cards = [...document.querySelectorAll<HTMLAnchorElement>('a.card')].filter(
        (c) => c.offsetParent !== null,
      );
      if (cards.length === 0) return;
      const at = cards.indexOf(document.activeElement as HTMLAnchorElement);
      const next =
        at < 0 ? 0 : e.key === 'j' ? Math.min(at + 1, cards.length - 1) : Math.max(at - 1, 0);
      e.preventDefault();
      cards[next].focus({ preventScroll: true });
      cards[next].scrollIntoView({ block: 'nearest' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 4. Light.
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0;
    let card: HTMLElement | null = null;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('a.card');
      card = el instanceof HTMLElement ? el : null;
      if (!card) return;
      x = e.clientX;
      y = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${Math.round(x - r.left)}px`);
        card.style.setProperty('--my', `${Math.round(y - r.top)}px`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
    };
  }, []);

  if (openedHere === 0 && !hide) return null;

  const toggle = () => {
    const next = !hide;
    setHide(next);
    try {
      if (next) localStorage.setItem(HIDE_KEY, '1');
      else localStorage.removeItem(HIDE_KEY);
    } catch {
      /* the toggle still works for this page view */
    }
  };

  return (
    <button type="button" className="hidetoggle" aria-pressed={hide} onClick={toggle}>
      {hide ? 'Show opened' : 'Hide opened'}
      <span className="count">{openedHere}</span>
    </button>
  );
}
