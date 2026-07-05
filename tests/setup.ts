import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom doesn't implement scrolling; RouterView calls scrollTo on route change
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
  // Reset URL + body between tests — the hash router and the drawer
  // scroll-lock both mutate global state. (Guarded: the API route tests
  // run in a node environment with no window/document.)
  if (typeof window !== 'undefined') {
    window.location.hash = '';
    document.body.style.overflow = '';
  }
});
