import { createWorkspaceSchema, inviteMemberSchema } from "@quarry/contracts";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { useSession } from "../session";

type Member = { userId: string; email: string; role: string };

export function Workspace() {
  const { session, refresh } = useSession();
  const [name, setName] = useState(session?.workspace.name ?? "");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  async function loadMembers() {
    if (!session) return;
    const data = await api<{ members: Member[] }>(`/workspaces/${session.workspace.id}/members`);
    setMembers(data.members);
  }

  useEffect(() => {
    void loadMembers().catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load members"));
  }, [session?.workspace.id]);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      await api(`/workspaces/${session.workspace.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename workspace");
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const parsed = createWorkspaceSchema.safeParse({ name: workspaceName });
    if (!parsed.success) {
      setError("Name the workspace.");
      return;
    }
    setError("");
    const created = await api<{ id: string }>("/workspaces", { method: "POST", body: JSON.stringify(parsed.data) });
    await api(`/workspaces/${created.id}/activate`, { method: "POST" });
    setWorkspaceName("");
    await refresh();
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError("Enter a valid email.");
      return;
    }
    setError("");
    try {
      await api(`/workspaces/${session.workspace.id}/members`, { method: "POST", body: JSON.stringify(parsed.data) });
      setEmail("");
      await loadMembers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add member");
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>{session?.workspace.name}</h1>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <form className="panel form-grid" onSubmit={(event) => void rename(event)}>
        <label>
          Rename
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit">Save</button>
      </form>
      <form className="panel form-grid" onSubmit={(event) => void create(event)}>
        <label>
          New workspace
          <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Client research" />
        </label>
        <button type="submit" className="secondary">Create and switch</button>
      </form>
      <form className="panel form-grid" onSubmit={(event) => void invite(event)}>
        <label>
          Add member
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
        </label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit">Add</button>
      </form>
      <ul className="cards">
        {members.map((member) => (
          <li key={member.userId}>
            <strong>{member.email}</strong>
            <span>{member.role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
