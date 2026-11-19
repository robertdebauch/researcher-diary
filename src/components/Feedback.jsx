import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FeedbackContext } from "./feedbackContext";

/**
 * Обратная связь приложения: короткие сообщения вместо alert и собственный
 * диалог подтверждения вместо window.confirm (нативные блокируют интерфейс).
 */
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmation, setConfirmation] = useState(null);

  const nextIdRef = useRef(0);
  const resolveRef = useRef(null);
  const timersRef = useRef(new Set());

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const notify = useCallback((message, options = {}) => {
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    const tone = options.tone ?? "info";
    const timeout = options.timeout ?? (tone === "error" ? 6000 : 3000);

    setToasts((previous) => [...previous, { id, message, tone }]);

    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, timeout);

    timersRef.current.add(timer);
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setConfirmation(options);
      }),
    [],
  );

  const answerConfirmation = useCallback((value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setConfirmation(null);
  }, []);

  useEffect(() => {
    if (!confirmation) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        answerConfirmation(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmation, answerConfirmation]);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {confirmation && (
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet__panel confirm">
            <p className="confirm__text">{confirmation.message}</p>

            <div className="sheet__actions">
              <button
                className="btn btn--muted"
                onClick={() => answerConfirmation(false)}
              >
                {confirmation.cancelLabel ?? "Отмена"}
              </button>
              <button
                className="btn btn--accent"
                onClick={() => answerConfirmation(true)}
              >
                {confirmation.confirmLabel ?? "Да"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.tone}`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
