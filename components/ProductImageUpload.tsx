'use client';

import { useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

interface Props {
  /** Current array of photo URLs */
  urls:       string[];
  /** Called whenever the list changes (add or remove) */
  onChange:   (urls: string[]) => void;
  /** Max photos allowed (default 8) */
  maxPhotos?: number;
}

export default function ProductImageUpload({ urls, onChange, maxPhotos = 8 }: Props) {
  const fileRef            = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const remaining = maxPhotos - urls.length;
    if (remaining <= 0) {
      setError(`Maximum ${maxPhotos} photos allowed`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    setError('');
    setUploading(true);

    const sb       = getSupabase();
    const newUrls: string[] = [];

    for (const file of toUpload) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 20 * 1024 * 1024) {
        setError('Each photo must be under 20 MB');
        continue;
      }
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await sb.storage
        .from('product-images')
        .upload(path, file, { upsert: false });

      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        continue;
      }
      const { data } = sb.storage.from('product-images').getPublicUrl(path);
      newUrls.push(data.publicUrl);
    }

    if (newUrls.length) onChange([...urls, ...newUrls]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeUrl(idx: number) {
    onChange(urls.filter((_, i) => i !== idx));
  }

  return (
    <div className="pimg-wrap">
      {/* Thumbnails */}
      {urls.length > 0 && (
        <div className="pimg-grid">
          {urls.map((url, i) => (
            <div key={url} className={`pimg-thumb${i === 0 ? ' primary' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Product photo ${i + 1}`} />
              {i === 0 && <span className="pimg-primary-badge">Cover</span>}
              <button
                className="pimg-remove"
                type="button"
                onClick={() => removeUrl(i)}
                title="Remove photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {urls.length < maxPhotos && (
        <button
          type="button"
          className="pimg-add-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><span className="btn-spinner" /> Uploading…</>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
                <line x1="15" y1="9" x2="21" y2="9"/>
                <line x1="18" y1="6" x2="18" y2="12"/>
              </svg>
              Add {urls.length === 0 ? 'Photos' : 'More'} ({urls.length}/{maxPhotos})
            </>
          )}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
      />

      {error && (
        <div className="auth-error" style={{ marginTop: 8, fontSize: '.8rem' }}>{error}</div>
      )}

      {urls.length > 0 && (
        <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
          First photo is the cover image. Drag to reorder coming soon.
        </p>
      )}
    </div>
  );
}
