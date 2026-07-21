import { Nav } from "@/components/ui";
export default function AppLayout({ children }: { children: React.ReactNode }) { return <><Nav /><main className="mx-auto max-w-6xl px-4 py-8">{children}</main></>; }
