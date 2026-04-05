import { Navigate } from "react-router-dom";
export default function AdminProfile() {
  return <Navigate to="/admin/settings?tab=profile" replace />;
}
