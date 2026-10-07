"use client";

import { useEffect } from "react";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };
export type MenuState = { x: number; y: number; items: MenuItem[] };

const MENU_WIDTH = 208;

export default function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-context-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  const height = menu.items.length * 36 + 12;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));

  return (
    <div
      data-context-menu
      role="menu"
      className="fixed z-[70] flex flex-col gap-0.5 rounded-xl bg-surface p-1.5 text-left text-sm shadow-lg ring-1 ring-foreground/10"
      style={{ left, top, width: MENU_WIDTH }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover ${
            item.danger ? "text-danger" : ""
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
