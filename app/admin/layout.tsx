import type { ReactNode } from "react";
import { ensureSiteAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await ensureSiteAdmin();
  return children;
}
