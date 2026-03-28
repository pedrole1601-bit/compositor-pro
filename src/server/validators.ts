import fs from 'fs';
import path from 'path';

/**
 * Verifica os magic bytes de um buffer para confirmar o tipo de arquivo.
 * @param buffer Primeiros bytes do arquivo (mínimo 16 bytes)
 */
export function validateMagicBytes(buffer: Buffer): { success: boolean; mime?: string; ext?: string } {
  const hex = buffer.toString('hex', 0, 8).toUpperCase();

  // JPEG: FF D8 FF
  if (hex.startsWith('FFD8FF')) return { success: true, mime: 'image/jpeg', ext: 'jpg' };

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex.startsWith('89504E47')) return { success: true, mime: 'image/png', ext: 'png' };

  // GIF: 47 49 46 38
  if (hex.startsWith('47494638')) return { success: true, mime: 'image/gif', ext: 'gif' };

  // WebP: 52 49 46 46 (sub-type WEBP)
  if (hex.startsWith('52494646') && buffer.toString('utf8', 8, 12) === 'WEBP') {
    return { success: true, mime: 'image/webp', ext: 'webp' };
  }

  // MP4: offset 4 contem 'ftyp'
  if (buffer.toString('utf8', 4, 8) === 'ftyp') return { success: true, mime: 'video/mp4', ext: 'mp4' };

  // WebM: 1A 45 DF A3
  if (hex.startsWith('1A45DFA3')) return { success: true, mime: 'video/webm', ext: 'webm' };

  return { success: false };
}
