// Tiny trailing debounce — no dependencies.
export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  (debounced as any).cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return debounced as T & { cancel: () => void };
}
