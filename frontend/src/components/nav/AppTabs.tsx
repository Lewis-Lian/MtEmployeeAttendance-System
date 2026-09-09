import { useEffect, useRef, useState } from "react";

import "../../styles/components/app-tabs.css";

export interface AppTabItem {
  href: string;
  label: string;
}

export function reorderTabs(tabs: AppTabItem[], draggedHref: string, targetHref: string): AppTabItem[] {
  const draggedIndex = tabs.findIndex((tab) => tab.href === draggedHref);
  const targetIndex = tabs.findIndex((tab) => tab.href === targetHref);

  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return tabs;
  }

  const nextTabs = [...tabs];
  const [draggedTab] = nextTabs.splice(draggedIndex, 1);
  nextTabs.splice(targetIndex, 0, draggedTab);
  return nextTabs;
}

interface AppTabsProps {
  currentPath: string;
  tabs: AppTabItem[];
  onCloseTab: (href: string) => void;
  onNavigate: (href: string) => void;
  onRefreshTab: (href: string) => void;
  onReorderTab: (draggedHref: string, targetHref: string) => void;
  extra?: React.ReactNode;
}

export default function AppTabs({
  currentPath,
  tabs,
  onCloseTab,
  onNavigate,
  onRefreshTab,
  onReorderTab,
  extra,
}: AppTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const draggedHrefRef = useRef<string | null>(null);
  const [refreshingHref, setRefreshingHref] = useState<string | null>(null);
  const [draggedHref, setDraggedHref] = useState<string | null>(null);
  const [dragOverHref, setDragOverHref] = useState<string | null>(null);

  useEffect(() => {
    const el = tabListRef.current;
    if (!el) {
      return;
    }

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".app-tab-button")) {
        isDown = false;
        return;
      }
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };

    const handleMouseLeave = () => {
      isDown = false;
    };

    const handleMouseUp = () => {
      isDown = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) {
        return;
      }
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.scrollLeft = scrollLeft - walk;
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mouseleave", handleMouseLeave);
    el.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("mouseleave", handleMouseLeave);
      el.removeEventListener("mouseup", handleMouseUp);
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  function handleRefresh(href: string) {
    setRefreshingHref(href);
    onRefreshTab(href);
    window.setTimeout(() => setRefreshingHref((current) => (current === href ? null : current)), 500);
  }

  function handleDragStart(href: string, event: React.DragEvent<HTMLDivElement>) {
    draggedHrefRef.current = href;
    setDraggedHref(href);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", href);
  }

  function handleDragOver(href: string, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggedHrefRef.current !== href) {
      setDragOverHref(href);
    }
  }

  function handleDrop(href: string, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dragged = draggedHrefRef.current;
    if (dragged && dragged !== href) {
      onReorderTab(dragged, href);
    }
    handleDragEnd();
  }

  function handleDragEnd() {
    draggedHrefRef.current = null;
    setDraggedHref(null);
    setDragOverHref(null);
  }

  return (
    <section className="app-tab-bar" aria-label="已打开页面">
      <div className="app-tab-list" ref={tabListRef} role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.href === currentPath;

          return (
            <div
              className={`app-tab-button${isActive ? " is-active" : ""}${draggedHref === tab.href ? " is-dragging" : ""}${dragOverHref === tab.href ? " is-drag-over" : ""}`}
              draggable
              onDragEnd={handleDragEnd}
              onDragOver={(event) => handleDragOver(tab.href, event)}
              onDragStart={(event) => handleDragStart(tab.href, event)}
              onDrop={(event) => handleDrop(tab.href, event)}
              key={tab.href}
              role="presentation"
            >
              <button
                aria-selected={isActive}
                className="app-tab-trigger"
                onClick={() => onNavigate(tab.href)}
                role="tab"
                type="button"
              >
                <span className="app-tab-label">{tab.label}</span>
              </button>
              <span className="app-tab-actions">
                <button
                  aria-label={`刷新${tab.label}`}
                  className={`app-tab-refresh${refreshingHref === tab.href ? " is-refreshing" : ""}`}
                  onClick={() => handleRefresh(tab.href)}
                  type="button"
                >
                  ↻
                </button>
                {tabs.length > 1 ? (
                  <button
                    aria-label={`关闭${tab.label}`}
                    className="app-tab-close"
                    onClick={() => onCloseTab(tab.href)}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {extra && <div className="app-tab-extra">{extra}</div>}
    </section>
  );
}
