import { useState, useCallback } from "react";

let listeners = [];
let toasts = [];

function dispatch(toast) {
  toasts = [toast, ...toasts].slice(0, 3);
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    listeners.forEach((l) => l(toasts));
  }, 4000);
}

export function useToast() {
  const [state, setState] = useState(toasts);

  useState(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  });

  const toast = useCallback(({ title, description, variant }) => {
    dispatch({ id: Date.now().toString(), title, description, variant });
  }, []);

  return { toasts: state, toast };
}
