import { Skeleton, SkeletonText, SkeletonBadge } from '@/components/ui/skeleton';

export function ProfileCardSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Skeleton */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Success Banner Skeleton */}
        <div className="mb-6 p-4 bg-gray-100 rounded-lg">
          <div className="flex items-center">
            <Skeleton className="h-5 w-5 rounded-full mr-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-4 w-80 mt-2" />
        </div>

        {/* Profile Card Skeleton */}
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="bg-gray-200 px-6 py-8">
            <Skeleton className="h-8 w-48 bg-gray-300" />
            <div className="mt-2 flex items-center gap-4">
              <Skeleton className="h-4 w-40 bg-gray-300" />
              <Skeleton className="h-4 w-32 bg-gray-300" />
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center p-4 bg-gray-50 rounded-lg">
                  <Skeleton className="h-8 w-12 mx-auto" />
                  <Skeleton className="h-4 w-24 mx-auto mt-2" />
                </div>
              ))}
            </div>

            {/* Primary Skills */}
            <div>
              <Skeleton className="h-6 w-32 mb-3" />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonBadge key={i} className="w-20" />
                ))}
              </div>
            </div>

            {/* Secondary Skills */}
            <div>
              <Skeleton className="h-6 w-36 mb-3" />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonBadge key={i} className="w-16" />
                ))}
              </div>
            </div>

            {/* Summary */}
            <div>
              <Skeleton className="h-6 w-24 mb-3" />
              <SkeletonText lines={3} />
            </div>

            {/* Industries & Roles */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Skeleton className="h-6 w-24 mb-3" />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-4 w-32" />
                  ))}
                </div>
              </div>
              <div>
                <Skeleton className="h-6 w-16 mb-3" />
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-4 w-36" />
                  ))}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="pt-4 border-t border-gray-200">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36 mt-1" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-center space-x-4">
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </main>
    </div>
  );
}
