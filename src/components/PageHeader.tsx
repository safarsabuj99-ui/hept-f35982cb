import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, subtitle, icon, actions }, ref) => {
    return (
      <div
        ref={ref}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up-fade"
      >
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 self-start">{actions}</div>}
      </div>
    );
  }
);

PageHeader.displayName = "PageHeader";
