// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Skeleton shown instantly while dashboard data loads (range switches, refreshes).
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6 pb-5 px-6 space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-60 w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Top spenders */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
