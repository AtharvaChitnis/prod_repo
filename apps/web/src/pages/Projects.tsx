import { createProjectSchema } from "@quarry/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorText } from "../api";

type Project = { id: string; name: string; brief: string; updatedAt: string };

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ projects: Project[] }>("/projects");
    setProjects(data.projects);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(errorText(err, "Could not load projects")));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const parsed = createProjectSchema.safeParse({ name, brief: brief || undefined });
    if (!parsed.success) {
      setError("Give the project a name.");
      return;
    }
    setError("");
    await api("/projects", { method: "POST", body: JSON.stringify(parsed.data) });
    setName("");
    setBrief("");
    await load();
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Projects</p>
          <h1>Research desks</h1>
        </div>
      </header>
      <form className="panel form-grid" onSubmit={(event) => void create(event)}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Q3 competitor memo" />
        </label>
        <label>
          Brief
          <input value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="What this desk is for" />
        </label>
        <button type="submit">Create project</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <ul className="cards">
        {projects.map((project) => (
          <li key={project.id}>
            <Link to={`/app/projects/${project.id}`}>
              <strong>{project.name}</strong>
              <span>{project.brief || "No brief yet"}</span>
            </Link>
          </li>
        ))}
      </ul>
      {projects.length === 0 ? <p className="muted">No projects yet.</p> : null}
    </section>
  );
}
