import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div className={cn("shimmer rounded-md", className)} />
  );
}

export function TableSkeleton({ rows = 5, columns = 5, showHeader = true, className }: TableSkeletonProps) {
  return (
    <div className={cn("overflow-hidden", className)}>
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <ShimmerBlock className={cn(
                    "h-3",
                    i === 0 ? "w-32" : i === columns - 1 ? "w-16 ml-auto" : "w-20"
                  )} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <TableRow
              key={rowIdx}
              className="opacity-0 animate-slide-up-fade"
              style={{ animationDelay: `${rowIdx * 60}ms`, animationFillMode: "forwards" }}
            >
              {Array.from({ length: columns }).map((_, colIdx) => (
                <TableCell key={colIdx}>
                  <ShimmerBlock className={cn(
                    "h-4",
                    colIdx === 0 ? "w-36" :
                    colIdx === 1 ? "w-20" :
                    colIdx === columns - 1 ? "w-16 ml-auto" :
                    "w-24"
                  )} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <ShimmerBlock className="h-10 w-10 rounded-xl shrink-0" />
          <div className="space-y-2 flex-1">
            <ShimmerBlock className="h-3 w-24" />
            <ShimmerBlock className="h-7 w-32" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 xs:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="opacity-0 animate-slide-up-fade"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" }}
        >
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-3 animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <ShimmerBlock className="h-7 w-56" />
          <ShimmerBlock className="h-4 w-72" />
        </div>
        <ShimmerBlock className="h-9 w-28 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <ShimmerBlock className="h-7 w-28 rounded-full" />
        <ShimmerBlock className="h-7 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="opacity-0 animate-slide-up-fade" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
        <ShimmerBlock className="h-12 w-full rounded-xl" />
      </div>
      <KpiSkeletonGrid />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map(i => (
          <div key={i} className="opacity-0 animate-slide-up-fade" style={{ animationDelay: `${500 + i * 100}ms`, animationFillMode: "forwards" }}>
            <Card>
              <CardHeader>
                <ShimmerBlock className="h-4 w-40" />
              </CardHeader>
              <CardContent>
                <ShimmerBlock className="h-48 w-full rounded-lg" />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataPageSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-6">
      {title && (
        <div className="space-y-2 animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
          <ShimmerBlock className="h-7 w-48" />
          <ShimmerBlock className="h-4 w-64" />
        </div>
      )}
      <div className="opacity-0 animate-slide-up-fade" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton rows={6} columns={6} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
