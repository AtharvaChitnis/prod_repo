import { useEffect, useState } from "react";
import { api, errorText } from "../api";

type UsageResponse = {
  period: string;
  plan: string;
  researchRuns: number;
  entitlement: { researchRunsPerMonth: number; maxFiles: number };
};

type History = { events: { id: string; type: string; period: string; status: string; createdAt: string }[] };

export function Usage() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [history, setHistory] = useState<History["events"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([api<UsageResponse>("/usage"), api<History>("/usage/history")])
      .then(([current, past]) => {
        setUsage(current);
        setHistory(past.events);
      })
      .catch((err: unknown) => setError(errorText(err, "Could not load usage")));
  }, []);

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Usage</p>
          <h1>{usage ? usage.period : "This month"}</h1>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {usage ? (
        <div className="panel meter">
          <p>{usage.plan} plan</p>
          <strong>{usage.researchRuns} / {usage.entitlement.researchRunsPerMonth}</strong>
          <p className="muted">research runs reserved or completed this month</p>
        </div>
      ) : null}
      <ul className="cards">
        {history.map((event) => (
          <li key={event.id}>
            <strong>{event.type}</strong>
            <span>{event.status} · {event.period}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
