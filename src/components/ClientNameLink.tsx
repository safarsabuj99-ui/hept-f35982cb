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
 * Renders a client name that links to the client detail page for staff roles
 * (admin / manager / platform_owner). For clients themselves — or when no id
 * is available — it degrades gracefully to plain text.
 */
export function ClientNameLink({ clientId, name, className, stopPropagation = true }: ClientNameLinkProps) {
  const { role } = useAuth();
  const canNavigate =
    !!clientId && (role === "admin" || role === "manager" || role === "platform_owner");

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
