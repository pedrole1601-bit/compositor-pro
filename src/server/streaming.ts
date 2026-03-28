import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Manipulador de requisições para streaming de vídeo com suporte a Range Requests.
 * Permite que o player de vídeo faça "seek" (pular para partes do vídeo).
 */
export const videoStreamHandler = (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename as string); // Segurança contra path traversal
  const videoPath = path.resolve('uploads', filename);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(videoPath, { start, end });

    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4', // Idealmente detectar via magic bytes salvo no BD/Estado
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
};
