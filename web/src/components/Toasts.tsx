import { useToasts, dismissToast, type Toast } from '../toast';
import { useT } from '../i18n';

export default function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const t = useT();
  if (!toasts.length) return null;

  const renderGroup = (list: Toast[], className: string) =>
    list.length > 0 && (
      <div className={className} role="status" aria-live="polite">
        {list.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            onClick={() => dismissToast(toast.key)}
            title={t('common.close')}
          >
            <span className="toast-dot" />
            <span className="toast-text">{toast.text}</span>
          </div>
        ))}
      </div>
    );

  return (
    <>
      {renderGroup(
        toasts.filter((x) => x.top),
        'toasts toasts-top',
      )}
      {renderGroup(
        toasts.filter((x) => !x.top),
        'toasts',
      )}
    </>
  );
}
