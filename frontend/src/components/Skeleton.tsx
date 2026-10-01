interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return <span className={`skeleton ${className}`.trim()} style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonTaskList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="task-list skeleton-list" role="status" aria-label="Loading tasks">
      {Array.from({ length: rows }, (_, index) => (
        <li className="task-row skeleton-row" key={index}>
          <Skeleton className="skeleton-circle" width="22px" height="22px" />
          <div className="task-content">
            <Skeleton className="skeleton-line" width={`${70 - (index % 3) * 12}%`} height="14px" />
            <Skeleton className="skeleton-line" width="35%" height="11px" />
          </div>
          <Skeleton className="skeleton-line" width="64px" height="28px" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonRows({ rows = 4, width = '100%', height = '64px' }: { rows?: number; width?: string; height?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="skeleton-block" width={width} height={height} />
      ))}
    </div>
  );
}
