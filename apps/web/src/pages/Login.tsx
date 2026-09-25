import { oauthStartUrl } from "../api";
import { Navigate } from "react-router-dom";
import { useSession } from "../useSession";

export function Login() {
  const { session, loading } = useSession();
  if (loading) return <p className="boot">Opening workspace…</p>;
  if (session) return <Navigate to="/app/projects" replace />;

  return (
    <main className="login">
      <section>
        <p className="eyebrow">Quarry · B2B research</p>
        <h1>Research that stays attached to the source.</h1>
        <p className="lede">
          Upload the documents your team already trusts. Ask a question. Quarry retrieves the passages and writes a brief you can export.
        </p>
        <a className="button" href={oauthStartUrl()}>Continue with Google</a>
      </section>
      <aside>
        <ol>
          <li>Create a workspace for the team.</li>
          <li>Add source files to a project.</li>
          <li>Run a question against what was retrieved.</li>
        </ol>
      </aside>
    </main>
  );
}
