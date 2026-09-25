import { useEffect, useState } from "react";
import { api } from "./api";
import { SessionContext, type Session } from "./useSession";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setSession(await api<Session>("/auth/me"));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return <SessionContext.Provider value={{ session, loading, refresh }}>{children}</SessionContext.Provider>;
}
