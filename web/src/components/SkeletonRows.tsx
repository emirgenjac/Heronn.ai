export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="list skeleton-list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="row skeleton-row">
          <div className="skeleton-line w55" />
          <div className="skeleton-line w35" />
          <div className="skeleton-block" />
        </div>
      ))}
    </div>
  )
}
