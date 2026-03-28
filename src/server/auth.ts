import { Request, Response, NextFunction } from 'express';

const PIN = process.env.APP_PIN || '1234';

/**
 * Middleware para validar o PIN de acesso via header X-Auth-Pin.
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Ignorar validação para rotas públicas (se houver)
  if (req.path === '/api/health' || req.path.startsWith('/view/')) {
    return next();
  }

  const pin = req.headers['x-auth-pin'];

  if (pin === PIN) {
    next();
  } else {
    res.status(401).json({ error: 'PIN de acesso inválido ou ausente.' });
  }
};
