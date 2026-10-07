import type { AppRequest } from '../types/index';

export function requestLogger(req: AppRequest): void {
  const method = req.method;
  const url = req.url;
  const timestamp = new Date().toISOString();
  
  if (req.env?.NODE_ENV === 'development') {
    console.log(`[${timestamp}] ${method} ${url}`);
  }
}
