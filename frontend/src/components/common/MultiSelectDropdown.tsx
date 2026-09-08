import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import DropdownMotion from "../motion/DropdownMotion";
import "../../styles/components/multi-select-dropdown.css";

export interface MultiSelectOption {
  key: string;
  label: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  placeholder?: string;
}

const SUMMARY_LABEL_LIMIT = 2;

function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = "未选择",
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedKeys = options.filter((option) => value[option.key]).map((option) => option.key);
  const isAllSelected = options.length > 0 && selectedKeys.length === options.length;

  const summary = isAllSelected
    ? "全部"
    : selectedKeys.length === 0
      ? placeholder
      : selectedKeys.length <= SUMMARY_LABEL_LIMIT
        ? options
            .filter((option) => selectedKeys.includes(option.key))
            .map((option) => option.label)
            .join("、")
        : `已选 ${selectedKeys.length} 项`;

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelStyle({ left: rect.left, top: rect.bottom + 4, minWidth: rect.width });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      // 浮层渲染在 body 下，触发器与浮层之外的点击视为外部点击
      if (triggerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".multi-select-panel")) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const handleClose = () => setIsOpen(false);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [isOpen]);

  const toggleKey = (key: string, checked: boolean) => {
    onChange({ ...value, [key]: checked });
  };

  const applyToAll = (checked: boolean) => {
    const next = { ...value };
    options.forEach((option) => {
      next[option.key] = checked;
    });
    onChange(next);
  };

  return (
    <div className="multi-select-dropdown">
      <button
        aria-expanded={isOpen}
        className="multi-select-trigger"
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="multi-select-summary">{summary}</span>
        <span aria-hidden="true" className="multi-select-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>
      {createPortal(
        <DropdownMotion
          className="multi-select-panel"
          isOpen={isOpen && panelStyle !== null}
          style={panelStyle ?? undefined}
        >
          <div className="multi-select-actions">
            <button
              className="multi-select-action"
              onClick={() => applyToAll(true)}
              type="button"
            >
              全选
            </button>
            <button
              className="multi-select-action"
              onClick={() => applyToAll(false)}
              type="button"
            >
              清空
            </button>
          </div>
          <div className="multi-select-list" role="group">
            {options.map((option) => (
              <label key={option.key} className="multi-select-option" style={{ "--multi-select-index": options.indexOf(option) } as CSSProperties}>
                <input
                  checked={Boolean(value[option.key])}
                  onChange={(event) => toggleKey(option.key, event.target.checked)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </DropdownMotion>,
        document.body,
      )}
    </div>
  );
}

export default MultiSelectDropdown;
