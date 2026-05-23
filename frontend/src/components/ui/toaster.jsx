import { useToast } from "./use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(({ id, title, description, variant }) => (
        <div
          key={id}
          className={`rounded-xl border px-4 py-3 shadow-lg animate-slide-in ${
            variant === "destructive"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-white border-gray-200 text-gray-800"
          }`}
        >
          {title && <p className="text-sm font-semibold">{title}</p>}
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      ))}
    </div>
  );
}
