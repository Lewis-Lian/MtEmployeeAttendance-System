import { useEffect, useRef, useState } from "react";
import type { AccountSet } from "../../types/query";
import "./account-set-selector.css";

interface AccountSetSelectorProps {
  accountSets: AccountSet[];
  value: string;
  onChange: (month: string) => void;
  label?: string;
  compact?: boolean;
}

export default function AccountSetSelector({
  accountSets,
  value,
  onChange,
  label = "当前账套",
  compact = false,
}: AccountSetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const selected = accountSets.find((accountSet) => accountSet.month === value) ?? null;
  const disabled = accountSets.length === 0;
  const displayLabel = compact ? "账套选择" : label;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleSelect(accountSet: AccountSet) {
    onChange(accountSet.month);
    setIsOpen(false);
  }

  const optionsMenu = isOpen ? (
    <div aria-label={`${displayLabel}选项`} className="account-set-selector-menu" role="listbox">
      {accountSets.map((accountSet) => {
        const isSelected = accountSet.month === value;
        return (
          <button
            aria-selected={isSelected}
            className={`account-set-option${isSelected ? " is-selected" : ""}`}
            key={accountSet.id}
            onClick={() => handleSelect(accountSet)}
            role="option"
            type="button"
          >
            <span className="account-set-option-mark" aria-hidden="true">
              {isSelected ? "✓" : ""}
            </span>
            <span className="account-set-option-main">
              <strong>{accountSet.name}</strong>
              <span>{accountSet.month}</span>
            </span>
            <span className="account-set-option-status">
              {accountSet.is_active ? <span className="account-set-selector-badge is-active">当前</span> : null}
              {accountSet.is_locked ? <span className="account-set-selector-badge is-locked">已锁定</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  if (compact) {
    const compactName = selected?.name ?? "暂无可用账套";

    return (
      <div className="account-set-selector is-compact is-stacked" ref={selectorRef}>
        <span className="account-set-compact-label">账套选择</span>
        <div className="account-set-selector-menu-wrap">
          <button
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={`账套选择：${compactName}`}
            className="account-set-selector-trigger"
            disabled={disabled}
            onClick={() => setIsOpen((open) => !open)}
            role="combobox"
            type="button"
            value={value}
          >
            <span className="account-set-selector-trigger-content">
              <strong>{compactName}</strong>
            </span>
            {selected?.is_active ? <span className="account-set-selector-badge is-active">当前</span> : null}
            {selected?.is_locked ? <span className="account-set-selector-badge is-locked">已锁定</span> : null}
            <svg aria-hidden="true" className={`account-set-selector-chevron${isOpen ? " is-open" : ""}`} viewBox="0 0 20 20" fill="none">
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {optionsMenu}
        </div>
      </div>
    );
  }

  return (
    <div className="account-set-selector" ref={selectorRef}>
      <div className="account-set-selector-heading">
        <span className="account-set-selector-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
          </svg>
        </span>
        <div>
          <span className="account-set-selector-label">{displayLabel}</span>
          <strong className="account-set-selector-value">
            {selected?.name ?? (disabled ? "暂无可用账套" : "请选择账套")}
          </strong>
        </div>
      </div>
      <div className="account-set-selector-control">
        <div className="account-set-selector-meta">
          <span>{selected?.month ?? "—"}</span>
          {selected?.is_active ? <span className="account-set-selector-badge is-active">当前激活</span> : null}
          {selected?.is_locked ? <span className="account-set-selector-badge is-locked">已锁定</span> : null}
        </div>
        <div className="account-set-selector-menu-wrap">
          <button
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={displayLabel}
            className="account-set-selector-trigger"
            disabled={disabled}
            onClick={() => setIsOpen((open) => !open)}
            role="combobox"
            type="button"
            value={value}
          >
            <span className="account-set-selector-trigger-content">
              <strong>{selected?.name ?? "暂无可用账套"}</strong>
              {selected ? <small>{selected.month}</small> : null}
            </span>
            <svg aria-hidden="true" className={`account-set-selector-chevron${isOpen ? " is-open" : ""}`} viewBox="0 0 20 20" fill="none">
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {optionsMenu}
        </div>
      </div>
    </div>
  );
}
