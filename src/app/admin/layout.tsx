import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth/auth";
import { requireAdminRoute } from "@/lib/auth/admin-route";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminRoute("/admin", {
    readSession: auth,
    notFound,
  });

  return children;
}
