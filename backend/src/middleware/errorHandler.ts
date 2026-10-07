import type { AppRequest } from '../types/index';
import { withCors } from './cors';

export function errorHandler(error: Error, req: AppRequest): Response {
  console.error('[error]', error);

  const corsHeaders = (req as any).corsHeaders || {
    'Access-Control-Allow-Origin': 'https://cheeryhub.space',
    'Access-Control-Allow-Credentials': 'true',
  };

  const statusCode = (error as any).status || 500;
  const body = JSON.stringify({
    error: error.message || 'Internal Server Error',
    code: (error as any).code || 'INTERNAL_ERROR',
  });

  const response = new Response(body, {
    status: statusCode,
    headers: { 
      'Content-Type': 'application/json',
      ...corsHeaders
    },
  });

  return response;
}
