import { createContext, useContext } from "react";

export type Session = {
  user: { id: string; email: string; name: string; avatarUrl?: string };
  workspace: { id: string; role: string; name: string };
  workspaces: { id: string; name: string; role: string }[];
};

export type SessionState = {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
