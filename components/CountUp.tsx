'use client';

// CountUp — a number that counts up to its value once, when it first scrolls
// into view. The server renders the final value, so the markup is correct with
// no JS, for crawlers, and for screen readers (the animated digits are
// aria-hidden; the real value sits beside them for assistive tech). Reduced
// motion skips the animation entirely.

import { useEffect, useRef } from 'react';

const DURATION = 1100;
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = value.toLocaleString('en-US');

  useEffect(() => {
    const el = ref.current;
    if (!el || value < 10) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION);
        el.textContent = Math.round(ease(t) * value).toLocaleString('en-US');
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = final;
    };
  }, [value, final]);

  return (
    <span className={className}>
      {/* Keyed by value: this node's text is written directly while counting, so a
          new value gets a fresh node rather than one React has lost track of. */}
      <span key={final} ref={ref} aria-hidden className="countup">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
