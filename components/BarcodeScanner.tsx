'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetected: (code: string) => void;
  onClose:    () => void;
}

/**
 * Modal barcode scanner.
 * Uses html5-qrcode for camera-based EAN-13 / UPC-A / EAN-8 scanning.
 * Falls back to manual entry if camera is unavailable.
 */
export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const [status,      setStatus]      = useState<'loading' | 'scanning' | 'error'>('loading');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [manualCode,  setManualCode]  = useState('');
  const [lastScanned, setLastScanned] = useState('');
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('barcode-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: { width: 260, height: 130 },
          },
          (decodedText: string) => {
            if (detectedRef.current || !mounted) return;
            const cleaned = decodedText.replace(/\s/g, '');
            // Accept numeric barcodes of standard lengths
            if (/^\d{8,14}$/.test(cleaned)) {
              detectedRef.current = true;
              setLastScanned(cleaned);
              scanner.stop().catch(() => {});
              onDetected(cleaned);
              onClose();
            }
          },
          () => {} // per-frame errors are normal, ignore them
        );

        if (mounted) setStatus('scanning');
      } catch {
        if (mounted) {
          setStatus('error');
          setErrorMsg('Camera not available. Please enter the barcode manually below.');
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleManual() {
    const code = manualCode.trim().replace(/\D/g, '');
    if (code.length < 8) return;
    onDetected(code);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box barcode-modal-box"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>📷</span>
            <span style={{ fontWeight: 700 }}>Scan Barcode</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Camera viewport */}
          <div className="barcode-viewport">
            <div id="barcode-reader" style={{ width: '100%' }} />

            {status === 'loading' && (
              <div className="barcode-overlay">
                <div className="spinner" style={{ width: 28, height: 28 }} />
                <span style={{ fontSize: '.85rem', marginTop: 8 }}>Starting camera…</span>
              </div>
            )}

            {status === 'scanning' && (
              <div className="barcode-scan-line" />
            )}
          </div>

          {status === 'scanning' && (
            <p className="barcode-hint">
              📦 Point at a barcode (EAN-13, UPC-A, EAN-8, Code 128)
            </p>
          )}

          {status === 'error' && (
            <div className="auth-error" style={{ marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}

          {lastScanned && (
            <div className="barcode-detected-row">
              ✅ Scanned: <strong>{lastScanned}</strong>
            </div>
          )}

          {/* Divider */}
          <div className="barcode-divider">
            <span>or enter manually</span>
          </div>

          {/* Manual entry */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              className="form-input"
              placeholder="Enter barcode number…"
              value={manualCode}
              onChange={e => setManualCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleManual()}
              inputMode="numeric"
              maxLength={14}
              autoFocus={status === 'error'}
            />
            <button
              className="btn btn-primary"
              onClick={handleManual}
              disabled={manualCode.replace(/\D/g, '').length < 8}
              style={{ flexShrink: 0 }}
            >
              Search
            </button>
          </div>

          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
            Tip: Turn on your flashlight for better results in low light.
          </p>
        </div>
      </div>
    </div>
  );
}
