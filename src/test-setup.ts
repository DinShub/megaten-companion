/**
 * Global test setup (registered via angular.json `test.setupFiles`).
 *
 * jsdom implements neither `matchMedia` nor `ResizeObserver`, both of which
 * PrimeNG's responsive components (Menubar, Drawer, …) touch on init. Stub them
 * so component smoke tests can mount those components under the Vitest/jsdom
 * environment.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (typeof globalThis !== 'undefined' && typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== 'function') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
