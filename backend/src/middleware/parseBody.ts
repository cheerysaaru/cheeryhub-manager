import type { AppRequest } from "../types/index";

export async function parseJsonBody(req: AppRequest): Promise<void> {
  if (req.method === "GET" || req.method === "DELETE") {
    req.body = undefined;
    return;
  }

  try {
    const text = (await (req as any).text?.()) || "";
    req.body = text ? JSON.parse(text) : undefined;
  } catch (error) {
    req.body = undefined;
  }
}
