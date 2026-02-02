import { Skeleton, SkeletonBadge } from '@/components/ui/skeleton';

interface CandidateListSkeletonProps {
  count?: number;
}

export function CandidateCardSkeleton() {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <Skeleton className="h-6 w-40" />
            <SkeletonBadge className="w-24" />
          </div>

          <div className="mt-2 flex items-center space-x-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonBadge key={i} className="w-16" />
            ))}
          </div>
        </div>

        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}

export function CandidateListSkeleton({ count = 5 }: CandidateListSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CandidateCardSkeleton key={i} />
      ))}
    </div>
  );
}
