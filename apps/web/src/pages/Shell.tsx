import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";

export function Shell() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  if (!session) return null;

  async function activate(id: string) {
    await api(`/workspaces/${id}/activate`, { method: "POST" });
    await refresh();
    navigate("/app/projects");
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    await refresh();
    navigate("/");
  }

  return (
    <div className="shell">
      <aside className="rail">
        <p className="mark">Quarry</p>
        <label className="workspace-switch">
          Workspace
          <select value={session.workspace.id} onChange={(event) => void activate(event.target.value)}>
            {session.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
        </label>
        <nav>
          <NavLink to="/app/projects">Projects</NavLink>
          <NavLink to="/app/usage">Usage</NavLink>
          <NavLink to="/app/billing">Billing</NavLink>
          <NavLink to="/app/workspace">Workspace</NavLink>
        </nav>
        <div className="rail-foot">
          <p>{session.user.name}</p>
          <p className="muted">{session.workspace.role}</p>
          <button type="button" className="text" onClick={() => void logout()}>Sign out</button>
        </div>
      </aside>
      <div className="canvas">
        <Outlet />
      </div>
    </div>
  );
}
