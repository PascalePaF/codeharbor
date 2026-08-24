import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.kind}`} key={toast.id}>
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : toast.kind === 'error' ? <CircleAlert size={18} /> : <Info size={18} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
