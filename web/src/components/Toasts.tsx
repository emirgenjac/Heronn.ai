import type { Toast } from '../useQueue.ts'

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <>
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          {t.text}
        </div>
      ))}
    </>
  )
}
