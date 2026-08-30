import { BildoLogo } from "./BildoLogo";
import { Button } from "./Button";

interface ErrorScreenProps {
  error?: Error;
  onRetry: () => void;
  onGoHome: () => void;
}

export function ErrorScreen({ error, onRetry, onGoHome }: ErrorScreenProps) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-board p-6">
      <div className="w-full max-w-[420px] rounded-card border border-line-strong bg-panel p-7 shadow-md">
        <BildoLogo size="lg" />
        <h1 className="mt-5 text-[15px] font-semibold text-text">Что-то пошло не так</h1>
        <p className="mt-2 text-[13px] leading-[1.5] text-muted">
          Произошла непредвиденная ошибка. Попробуйте ещё раз или вернитесь на главную.
        </p>
        {import.meta.env.DEV && error && (
          <details className="mt-4 rounded-control border border-line bg-surface p-3">
            <summary className="cursor-pointer text-[11px] font-medium text-subtle">Детали ошибки</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-muted">
              {error.stack ?? error.message}
            </pre>
          </details>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onRetry}>
            Попробовать снова
          </Button>
          <Button variant="default" onClick={onGoHome}>
            На главную
          </Button>
        </div>
      </div>
    </div>
  );
}
