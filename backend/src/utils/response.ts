export const ok = (data: unknown, status = 200) => 
  new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export const fail = (message: string, status = 400) => 
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
