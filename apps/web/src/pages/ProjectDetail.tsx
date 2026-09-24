import { createResearchTaskSchema, searchSchema } from "@quarry/contracts";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, downloadExport, errorText } from "../api";

type FileRow = {
  id: string;
  filename: string;
  status: string;
  bytes: number;
  chunkCount: number;
  error: string | null;
};

type Task = {
  id: string;
  type: string;
  status: string;
  progress: { step: string; percent: number };
  error: { message: string } | null;
  resultId: string | null;
  input: { question?: string };
};

type Result = {
  id: string;
  payload: {
    summary: string;
    confidence: string;
    gaps: string[];
    findings: { claim: string; evidence: string; sourceIds: string[] }[];
  };
  sources: { chunkId: string; label: string; excerpt: string }[];
};

type Hit = { chunkId: string; sourceLabel: string; excerpt: string; score: number };

export function ProjectDetail() {
  const { id = "" } = useParams();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [question, setQuestion] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [project, fileData, taskData] = await Promise.all([
      api<{ name: string }>(`/projects/${id}`),
      api<{ files: FileRow[] }>(`/projects/${id}/files`),
      api<{ tasks: Task[] }>(`/projects/${id}/tasks`),
    ]);
    setName(project.name);
    setFiles(fileData.files);
    setTasks(taskData.tasks);
    const latest = taskData.tasks.find((task) => task.type === "research" && task.resultId);
    if (latest?.resultId) setResult(await api<Result>(`/results/${latest.resultId}`));
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(errorText(err)));
  }, [id]);

  const busy = files.some((file) => file.status === "processing") || tasks.some((task) => task.status === "queued" || task.status === "running");

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [busy, id]);

  async function upload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError("");
    const body = new FormData();
    body.set("file", file);
    try {
      await api(`/projects/${id}/files`, { method: "POST", body });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function runResearch(event: React.FormEvent) {
    event.preventDefault();
    const parsed = createResearchTaskSchema.safeParse({ projectId: id, question });
    if (!parsed.success) {
      setError("Write a question of at least a few words.");
      return;
    }
    setError("");
    try {
      await api("/tasks", { method: "POST", body: JSON.stringify(parsed.data) });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const parsed = searchSchema.safeParse({ query });
    if (!parsed.success) {
      setError("Enter a search query.");
      return;
    }
    setError("");
    try {
      const data = await api<{ hits: Hit[] }>(`/projects/${id}/search`, { method: "POST", body: JSON.stringify(parsed.data) });
      setHits(data.hits);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const active = tasks.find((task) => task.type === "research" && (task.status === "queued" || task.status === "running"));

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Project</p>
          <h1>{name || "Project"}</h1>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="split">
        <div>
          <form className="panel stack" onSubmit={(event) => void runResearch(event)}>
            <label>
              Research question
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} placeholder="What changed in renewal risk this quarter?" />
            </label>
            <button type="submit">Run research</button>
            {active ? <p className="muted">{active.status} · {active.progress.step} {active.progress.percent}%</p> : null}
          </form>
          {result ? (
            <article className="panel result">
              <div className="result-head">
                <h2>Brief</h2>
                <span className="pill">{result.payload.confidence} confidence</span>
              </div>
              <p>{result.payload.summary}</p>
              <ul className="findings">
                {result.payload.findings.map((finding) => (
                  <li key={finding.claim}>
                    <strong>{finding.claim}</strong>
                    <p>{finding.evidence}</p>
                    <p className="muted">{finding.sourceIds.join(", ") || "No cited source"}</p>
                  </li>
                ))}
              </ul>
              {result.payload.gaps.length ? <p className="muted">Gaps: {result.payload.gaps.join(" · ")}</p> : null}
              <div className="row">
                <button type="button" className="secondary" onClick={() => void downloadExport(result.id, "json")}>Export JSON</button>
                <button type="button" className="secondary" onClick={() => void downloadExport(result.id, "csv")}>Export CSV</button>
              </div>
            </article>
          ) : null}
        </div>
        <div className="stack">
          <form className="panel stack">
            <label>
              Source file
              <input type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={(event) => void upload(event.target.files)} />
            </label>
            <ul className="file-list">
              {files.map((file) => (
                <li key={file.id}>
                  <span>{file.filename}</span>
                  <span className="muted">{file.status}{file.chunkCount ? ` · ${file.chunkCount} chunks` : ""}{file.error ? ` · ${file.error}` : ""}</span>
                </li>
              ))}
            </ul>
          </form>
          <form className="panel stack" onSubmit={(event) => void search(event)}>
            <label>
              Search sources
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ingested text" />
            </label>
            <button type="submit" className="secondary">Retrieve passages</button>
            <ul className="file-list">
              {hits.map((hit) => (
                <li key={hit.chunkId}>
                  <span>{hit.sourceLabel} · {hit.score}</span>
                  <span>{hit.excerpt}</span>
                </li>
              ))}
            </ul>
          </form>
        </div>
      </div>
    </section>
  );
}
