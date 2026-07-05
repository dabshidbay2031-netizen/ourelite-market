'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Renders a long list in growing slices instead of all at once.
 *
 * The full catalog is 600+ products; mounting every ProductCard in one pass
 * costs ~18k DOM nodes and 2k images. This keeps the DOM small: show the
 * first `pageSize` items and grow the slice whenever the returned sentinel
 * element scrolls near the viewport (classic infinite scroll).
 *
 * `resetKey` — pass the active filter/search state; when it changes the
 * slice shrinks back to the first page so a new filter starts at the top.
 */
export function useIncrementalList<T>(items: T[], resetKey: unknown, pageSize = 24) {
  const [count, setCount] = useState(pageSize);

  useEffect(() => { setCount(pageSize); }, [resetKey, pageSize]);

  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);

  // Callback ref for the sentinel <div> rendered after the list.
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setCount(c => c + pageSize);
      }
    }, { rootMargin: '800px' }); // start loading well before the user reaches the end
    observer.current.observe(node);
  }, [pageSize]);

  return {
    visible: items.slice(0, count),
    hasMore: count < items.length,
    sentinelRef,
  };
}
