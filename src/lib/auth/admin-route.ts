import type { Session } from "next-auth";
import type { AppRole } from "./roles";
import { track } from "../analytics/track";

export type AdminRouteSessionReader = () => Promise<Session | null>;
export type NotFoundFn = () => never;
export type TrackAdminUnauthorizedFn = (event: {
  event: "admin_route_unauthorized";
  role: AppRole | "anonymous";
  path: string;
}) => void;

export interface AdminRouteGateOptions {
  readSession: AdminRouteSessionReader;
  notFound: NotFoundFn;
  trackEvent?: TrackAdminUnauthorizedFn;
}

export async function requireAdminRoute(
  path: string,
  options: AdminRouteGateOptions,
) {
  const session = await options.readSession();
  const user = session?.user;

  if (!user?.id || user.role !== "admin") {
    const role = user?.role ?? "anonymous";
    (options.trackEvent ?? track)({
      event: "admin_route_unauthorized",
      role,
      path,
    });
    options.notFound();
  }

  return user;
}
