import { Request, Response, NextFunction } from 'express';

export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;

  // If env vars are missing, deny access
  if (!username || !password) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Extract Authorization header
  const authHeader = req.headers.authorization;

  // If no Authorization header, deny access
  if (!authHeader) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Parse Basic Auth credentials
  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const credentials = Buffer.from(match[1], 'base64').toString('utf-8');
    const [providedUsername, providedPassword] = credentials.split(':');

    // Validate credentials
    if (providedUsername === username && providedPassword === password) {
      return next();
    }
  } catch {
    // Invalid base64 or parsing error
  }

  return res.status(403).json({ error: 'Forbidden' });
}
