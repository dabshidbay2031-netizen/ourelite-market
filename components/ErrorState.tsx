'use client';

interface Props {
  /** What failed to load, e.g. "orders". */
  what?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

/**
 * Shown when a data fetch genuinely FAILS (network/server) — distinct from a
 * successful-but-empty result. Silently falling back to an empty state hides
 * outages and leaves users staring at "No data" when the real problem is a
 * failed request they could just retry.
 */
export default function ErrorState({ what = 'data', onRetry, retrying, compact }: Props) {
  return (
    <div className="empty-state" style={{ padding: compact ? '20px 0' : '40px 0' }}>
      <div className="empty-icon">📡</div>
      <div className="empty-title">Couldn&apos;t load {what}</div>
      <div className="empty-sub">
        Check your connection and try again — your data is safe.
      </div>
      {onRetry && (
        <button
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? 'Retrying…' : '↻ Retry'}
        </button>
      )}
    </div>
  );
}
