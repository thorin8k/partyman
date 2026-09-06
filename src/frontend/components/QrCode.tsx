import { useEffect, useRef } from 'react';
import { encodeQrText } from './qr';

// ponytail: canvas + zona de silencio; sin dependencias.
export function QrCode({ text, size = 192 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let modules: boolean[][];
    try {
      modules = encodeQrText(text);
    } catch {
      return;
    }
    const n = modules.length;
    const quiet = 4;
    const scale = Math.max(1, Math.floor(size / (n + quiet * 2)));
    canvas.width = canvas.height = (n + quiet * 2) * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }, [text, size]);

  return <canvas ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated' }} role="img" aria-label={`QR: ${text}`} />;
}
