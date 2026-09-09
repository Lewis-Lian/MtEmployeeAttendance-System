import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom 不实现 matchMedia（motion 的 reducedMotion 探测需要）
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// jsdom 不实现 ResizeObserver（number-flow 需要）
if (typeof window !== "undefined" && !window.ResizeObserver) {
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

// jsdom 自定义元素不会加载 NumberFlow 的 HTMLElement 实现，补齐更新钩子以便测试真实数值更新流程。
if (typeof HTMLElement !== "undefined") {
  const elementPrototype = HTMLElement.prototype as HTMLElement & {
    willUpdate?: () => void;
    didUpdate?: () => void;
  };
  elementPrototype.willUpdate ??= () => {};
  elementPrototype.didUpdate ??= () => {};
}
