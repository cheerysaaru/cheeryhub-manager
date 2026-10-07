import type { AppRequest, AppEnv } from './types/index';
import { verifyAuth } from './middleware/auth';
import * as authRoutes from './routes/auth';
import * as healthRoutes from './routes/health';
import * as tasksRoutes from './routes/tasks';
import * as habitsRoutes from './routes/habits';
import * as goalsRoutes from './routes/goals';
import * as skillsRoutes from './routes/skills';
import * as notificationsRoutes from './routes/notifications';
import * as remindersRoutes from './routes/reminders';
import * as transactionsRoutes from './routes/transactions';
import * as settingsRoutes from './routes/settings';
import * as streaksRoutes from './routes/streaks';
import * as analyticsRoutes from './routes/analytics';
import * as brandRoutes from './routes/brand';
import * as backupRoutes from './routes/backup';

const getCorsHeaders = (origin: string): Record<string, string> => {
  const allowedOrigins = [
    'https://cheeryhub.space',
    'https://www.cheeryhub.space',
    'https://cheerysaaru.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ];
  
  const isAllowed = allowedOrigins.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://cheeryhub.space',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
};

const parseUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    pathname: parsed.pathname,
    searchParams: parsed.searchParams
  };
};

const parseJsonBody = async (request: Request): Promise<any> => {
  try {
    if (request.method === 'GET' || request.method === 'DELETE' || request.method === 'OPTIONS' || request.method === 'HEAD') {
      return undefined;
    }
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return undefined;
    }
    return await request.json().catch(() => undefined);
  } catch (error) {
    console.error('[parseJsonBody]', error);
    return undefined;
  }
};

async function handleRequest(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('origin') || '';
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const { pathname, searchParams } = parseUrl(request.url);
    const body = await parseJsonBody(request);
    
    // Create app request
    const appReq: any = {
      ...request,
      method: request.method,
      url: request.url,
      pathname,
      searchParams,
      body,
      env,
      headers: request.headers,
      params: {}
    };
    
    let response: Response | undefined;

    // Public routes
    if (pathname === '/api/health' && request.method === 'GET') {
      response = await healthRoutes.health(appReq);
    } else if (pathname === '/api/auth/register' && request.method === 'POST') {
      response = await authRoutes.register(appReq);
    } else if (pathname === '/api/auth/login' && request.method === 'POST') {
      response = await authRoutes.login(appReq);
    } else if (pathname === '/api/auth/logout' && request.method === 'POST') {
      response = await authRoutes.logout(appReq);
    }
    
    // Protected routes - require auth first
    else {
      const authResult = await verifyAuth(appReq);
      
      if (authResult instanceof Response) {
        // Auth failed
        return new Response(authResult.body, {
          status: authResult.status,
          headers: corsHeaders
        });
      }
      
      // Auth succeeded, update request with user
      Object.assign(appReq, authResult);
      
      // Tasks routes
      if (pathname === '/api/tasks' && request.method === 'GET') {
        response = await tasksRoutes.listTasks(appReq);
      } else if (pathname === '/api/tasks' && request.method === 'POST') {
        response = await tasksRoutes.createTask(appReq);
      } else if (pathname.match(/^\/api\/tasks\/[^/]+$/) && request.method === 'GET') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await tasksRoutes.getTask(appReq);
      } else if (pathname.match(/^\/api\/tasks\/[^/]+$/) && request.method === 'PUT') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await tasksRoutes.updateTask(appReq);
      } else if (pathname.match(/^\/api\/tasks\/[^/]+$/) && request.method === 'DELETE') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await tasksRoutes.deleteTask(appReq);
      }
      
      // Habits routes
      else if (pathname === '/api/habits' && request.method === 'GET') {
        response = await habitsRoutes.listHabits(appReq);
      } else if (pathname === '/api/habits' && request.method === 'POST') {
        response = await habitsRoutes.createHabit(appReq);
      } else if (pathname.match(/^\/api\/habits\/[^/]+$/) && request.method === 'GET') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await habitsRoutes.getHabit(appReq);
      } else if (pathname.match(/^\/api\/habits\/[^/]+$/) && request.method === 'PUT') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await habitsRoutes.updateHabit(appReq);
      } else if (pathname.match(/^\/api\/habits\/[^/]+$/) && request.method === 'DELETE') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await habitsRoutes.deleteHabit(appReq);
      } else if (pathname.match(/^\/api\/habits\/[^/]+\/complete$/) && request.method === 'POST') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await habitsRoutes.completeHabit(appReq);
      }
      
      // Goals routes
      else if (pathname === '/api/goals' && request.method === 'GET') {
        response = await goalsRoutes.listGoals(appReq);
      } else if (pathname === '/api/goals' && request.method === 'POST') {
        response = await goalsRoutes.createGoal(appReq);
      } else if (pathname.match(/^\/api\/goals\/[^/]+$/) && request.method === 'PUT') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await goalsRoutes.updateGoal(appReq);
      } else if (pathname.match(/^\/api\/goals\/[^/]+$/) && request.method === 'DELETE') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await goalsRoutes.deleteGoal(appReq);
      }
      
      // Streaks routes
      else if (pathname === '/api/streaks' && request.method === 'GET') {
        response = await streaksRoutes.getStreaks(appReq);
      } else if (pathname.match(/^\/api\/streaks\/[^/]+\/check-in$/) && request.method === 'POST') {
        const id = pathname.split('/')[3];
        appReq.params.id = id;
        response = await streaksRoutes.checkIn(appReq);
      }
      
      // Analytics routes
      else if (pathname === '/api/analytics' && request.method === 'GET') {
        response = await analyticsRoutes.getAnalytics(appReq);
      }
      
      // Notifications routes
      else if (pathname === '/api/notifications' && request.method === 'GET') {
        response = await notificationsRoutes.listNotifications(appReq);
      }
      
      // Skills, Settings, Transactions, Reminders, Brand, Backup routes
      else if (pathname === '/api/skills' && request.method === 'GET') {
        response = await skillsRoutes.listSkills(appReq);
      } else if (pathname === '/api/skills' && request.method === 'POST') {
        response = await skillsRoutes.createSkill(appReq);
      } else if (pathname === '/api/settings' && request.method === 'GET') {
        response = await settingsRoutes.getSettings(appReq);
      } else if (pathname === '/api/settings' && request.method === 'PUT') {
        response = await settingsRoutes.updateSettings(appReq);
      } else if (pathname === '/api/transactions' && request.method === 'GET') {
        response = await transactionsRoutes.listTransactions(appReq);
      } else if (pathname === '/api/transactions' && request.method === 'POST') {
        response = await transactionsRoutes.createTransaction(appReq);
      } else if (pathname === '/api/reminders' && request.method === 'GET') {
        response = await remindersRoutes.listReminders(appReq);
      } else if (pathname === '/api/reminders' && request.method === 'POST') {
        response = await remindersRoutes.createReminder(appReq);
      } else if (pathname === '/api/brand' && request.method === 'GET') {
        response = await brandRoutes.getBrand(appReq);
      } else if (pathname === '/api/brand' && request.method === 'PUT') {
        response = await brandRoutes.updateBrand(appReq);
      } else if (pathname === '/api/backup/export' && request.method === 'POST') {
        response = await backupRoutes.exportData(appReq);
      }
    }

    // No route matched
    if (!response) {
      return new Response(JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: corsHeaders
      });
    }

    // Add CORS headers to response
    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('[handleRequest]', error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message || 'Internal Server Error',
        code: 'INTERNAL_ERROR'
      }),
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      console.error('[fetch]', error);
      return new Response(
        JSON.stringify({ error: 'Worker Error', code: 'WORKER_ERROR' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
};
