import { Skeleton, SkeletonText, SkeletonBadge } from '@/components/ui/skeleton';

export function ReviewFormSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Confidence Banner */}
        <div className="mb-6 p-4 bg-gray-100 rounded-lg">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>

        <div className="card p-6 space-y-8">
          {/* Basic Information */}
          <div>
            <Skeleton className="h-6 w-36 mb-4" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div>
            <Skeleton className="h-6 w-24 mb-4" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-28 mb-2" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Primary Skills */}
          <div>
            <Skeleton className="h-6 w-28 mb-4" />
            <div className="flex flex-wrap gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonBadge key={i} className="w-24 h-8" />
              ))}
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-md" />
              <Skeleton className="h-10 w-20 rounded-md" />
            </div>
          </div>

          {/* Secondary Skills */}
          <div>
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="flex flex-wrap gap-2 mb-3">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBadge key={i} className="w-20" />
              ))}
            </div>
          </div>

          {/* Summary */}
          <div>
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </main>
    </div>
  );
}

export function SearchCriteriaSkeleton() {
  return (
    <div className="space-y-6">
      {/* Suggestions */}
      <div className="card p-4 bg-gray-100">
        <Skeleton className="h-5 w-32 mb-2" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>

      <div className="card p-6">
        <Skeleton className="h-7 w-36 mb-6" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Skills sections */}
          {[1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-32 mb-2" />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((j) => (
                  <SkeletonBadge key={j} className="w-20" />
                ))}
              </div>
            </div>
          ))}

          {/* Experience */}
          <div>
            <Skeleton className="h-4 w-32 mb-2" />
            <div className="flex items-center space-x-2">
              <Skeleton className="h-10 w-24 rounded-md" />
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </div>

          {/* Seniority */}
          <div>
            <Skeleton className="h-4 w-28 mb-2" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBadge key={i} className="w-16" />
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Availability */}
          <div>
            <Skeleton className="h-4 w-24 mb-2" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((i) => (
                <SkeletonBadge key={i} className="w-20" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}
