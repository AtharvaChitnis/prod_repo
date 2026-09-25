import { Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./pages/Login";
import { Shell } from "./pages/Shell";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Usage } from "./pages/Usage";
import { Billing } from "./pages/Billing";
import { Workspace } from "./pages/Workspace";
import { useSession } from "./useSession";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/app" element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Navigate to="projects" replace />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="usage" element={<Usage />} />
        <Route path="billing" element={<Billing />} />
        <Route path="workspace" element={<Workspace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <p className="boot">Opening workspace…</p>;
  if (!session) return <Navigate to="/" replace />;
  return children;
}
