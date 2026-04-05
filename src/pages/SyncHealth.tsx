import { Navigate } from "react-router-dom";
export default function SyncHealth() {
  return <Navigate to="/admin/settings?tab=sync" replace />;
}
