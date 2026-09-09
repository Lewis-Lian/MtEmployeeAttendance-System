import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppTabs, { reorderTabs, type AppTabItem } from "./AppTabs";

const tabs: AppTabItem[] = [
  { href: "/first", label: "第一页" },
  { href: "/second", label: "第二页" },
  { href: "/third", label: "第三页" },
];

afterEach(() => {
  cleanup();
});

describe("AppTabs", () => {
  it("拖动页签到另一页签时报告来源和目标", () => {
    const onReorderTab = vi.fn();
    const { container } = render(
      <AppTabs
        currentPath="/first"
        onCloseTab={vi.fn()}
        onNavigate={vi.fn()}
        onRefreshTab={vi.fn()}
        onReorderTab={onReorderTab}
        tabs={tabs}
      />,
    );

    const tabButtons = container.querySelectorAll<HTMLElement>(".app-tab-button");
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(tabButtons[0], { dataTransfer });
    fireEvent.dragOver(tabButtons[2], { dataTransfer });
    fireEvent.drop(tabButtons[2], { dataTransfer });

    expect(onReorderTab).toHaveBeenCalledWith("/first", "/third");
  });

  it("按拖动方向把页签移动到目标位置", () => {
    expect(reorderTabs(tabs, "/first", "/third").map((tab) => tab.href)).toEqual([
      "/second",
      "/third",
      "/first",
    ]);
    expect(reorderTabs(tabs, "/third", "/first").map((tab) => tab.href)).toEqual([
      "/third",
      "/first",
      "/second",
    ]);
  });
});
