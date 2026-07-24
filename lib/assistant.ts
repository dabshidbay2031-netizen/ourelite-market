/**
 * The AI help assistant is mounted once in the root layout (<AiAssistant/>).
 * The floating in-page button was removed — the assistant is now opened from
 * the nav menu (Sidebar + the mobile drawer). Those trigger it via this tiny
 * window-event bus so no shared React context/provider is needed.
 */
export const OPEN_ASSISTANT_EVENT = 'hamar:open-assistant';

export function openAssistant() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
  }
}
