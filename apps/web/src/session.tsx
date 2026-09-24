import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type Session = {
  user: { id: string; email: string; name: string; avatarUrl?: string };
  workspace: { id: string; role: string; name: string };
  workspaces: { id: string; name: string; role: string }[];
};

type SessionState = {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

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

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
