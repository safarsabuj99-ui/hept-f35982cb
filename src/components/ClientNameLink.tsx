import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface ClientNameLinkProps {
  clientId?: string | null;
  name: string;
  className?: string;
  /** Prevent the click from bubbling to a clickable parent row. */
  stopPropagation?: boolean;
}

/**
 * Renders a client name that links to the client detail page for administrators.
 * Other roles — or rows without a client id — receive safe plain text because
 * the current client-detail route is administrator-only.
 */
export function ClientNameLink({ clientId, name, className, stopPropagation = true }: ClientNameLinkProps) {
  const { role } = useAuth();
  const canNavigate = !!clientId && role === "admin";

  if (!canNavigate) {
    return <span className={className}>{name}</span>;
  }

  const base = "/admin/clients";

  return (
    <Link
      to={`${base}/${clientId}`}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
      className={cn(
        "hover:underline underline-offset-2 hover:text-primary transition-colors cursor-pointer",
        className,
      )}
    >
      {name}
    </Link>
  );
}
