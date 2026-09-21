import type { Response } from 'express';

export const ok = (response: Response, data: unknown, status = 200) => response.status(status).json({ data });
export const fail = (response: Response, message: string, status = 400) => response.status(status).json({ error: message });