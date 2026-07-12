export function readReceiptAutoPrintSetting(): boolean {
  try {
    const raw = localStorage.getItem('mogarenta_settings');
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { autoPrint?: unknown };
    return !!parsed.autoPrint;
  } catch {
    return false;
  }
}
