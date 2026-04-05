import { Navigate } from "react-router-dom";
export default function Integrations() {
  return <Navigate to="/admin/settings?tab=integrations" replace />;
}
