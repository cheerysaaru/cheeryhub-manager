import type { AppRequest } from "../types/index";

export async function health(_req: AppRequest): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
