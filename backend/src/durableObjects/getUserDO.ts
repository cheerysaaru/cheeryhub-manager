import type { AppEnv } from "../types/index";
import type { UserDO } from "./UserDO";

// Resolve the current user's Durable Object stub by the session user id.
// The id ALWAYS comes from the verified session, never from the request body.
export function getUserDO(
  env: AppEnv,
  userId: string,
): DurableObjectStub<UserDO> {
  const ns = env.USER_DO as DurableObjectNamespace;
  return ns.get(ns.idFromName(`user:${userId}`)) as DurableObjectStub<UserDO>;
}
