"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

export function CustomSelect({
  value,
  options,
  placeholder = "Choose…",
  ariaLabel,
  disabled,
  className = "",
  onChange,
}: {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(180, rect.width);
      const maxLeft = window.innerWidth - width - 8;
      setPosition({
        top: rect.bottom + 5,
        left: Math.max(8, Math.min(rect.left, maxLeft)),
        width,
      });
    };
    update();
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (
        !triggerRef.current?.contains(node) &&
        !menuRef.current?.contains(node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function choose(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function move(direction: number) {
    if (options.length === 0) return;
    let next = activeIndex;
    do next = (next + direction + options.length) % options.length;
    while (options[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`custom-select-trigger${open ? " is-open" : ""} ${className}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          const selectedIndex = Math.max(
            0,
            options.findIndex((option) => option.value === value),
          );
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else move(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" || event.key === " ") {
            if (!open) return;
            event.preventDefault();
            const option = options[activeIndex];
            if (option) choose(option);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span className="custom-select-value">
          {selected?.icon}
          <span>{selected?.label ?? placeholder}</span>
        </span>
        <CaretDown size={13} weight="bold" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="custom-select-popover"
            style={position}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                className={`custom-select-option${index === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
              >
                <span className="custom-select-option-icon">{option.icon}</span>
                <span className="custom-select-option-copy">
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                {option.value === value && (
                  <Check size={14} weight="bold" aria-hidden />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
