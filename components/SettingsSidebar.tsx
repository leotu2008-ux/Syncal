"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type SettingsSection = { id: string; label: string; hint: string; alert?: boolean };

/**
 * Settings navigation. Always visible on wide screens; on phones it slides in
 * from the left when the menu button is tapped.
 */
export default function SettingsSidebar({
  sections,
  current,
  email,
}: {
  sections: SettingsSection[];
  current: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = sections.find((s) => s.id === current)?.label ?? "Settings";

  // Close on Escape, and don't let the page behind scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const nav = (
    <nav aria-label="Settings sections" className="flex h-full flex-col">
      <Link
        href="/"
        className="mb-6 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <span aria-hidden="true">‹</span> Back to calendar
      </Link>
      <h1 className="mb-4 px-3 font-display text-2xl font-bold tracking-tight">Settings</h1>
      <ul className="flex flex-col gap-1">
        {sections.map((s) => {
          const active = s.id === current;
          return (
            <li key={s.id}>
              <Link
                href={`/settings?section=${s.id}`}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col rounded-lg px-3 py-2 ${
                  active ? "bg-ink text-bg" : "hover:bg-bg"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  {s.label}
                  {s.alert && (
                    <span
                      aria-label="needs attention"
                      className="size-2 rounded-full bg-[#e5372f]"
                    />
                  )}
                </span>
                <span className={`text-xs ${active ? "opacity-75" : "text-muted"}`}>{s.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <form action="/api/auth/logout" method="post" className="mt-auto border-t border-line px-3 pt-4">
        <p className="truncate text-xs text-muted">Signed in as {email}</p>
        <button type="submit" className="mt-1 text-sm font-semibold underline underline-offset-2">
          Sign out
        </button>
      </form>
    </nav>
  );

  return (
    <>
      {/* Phones: a bar with the menu button and the current section. */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="settings-drawer"
          className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Settings
        </button>
        <span className="truncate text-sm text-muted">{currentLabel}</span>
        {sections.some((s) => s.alert) && (
          <span aria-hidden="true" className="size-2 rounded-full bg-[#e5372f]" />
        )}
      </div>

      {/* Phones: the slide-in drawer. */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="settings-drawer"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto bg-surface px-3 py-5 shadow-xl transition-transform md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>

      {/* Wide screens: always-open sidebar. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-line px-3 py-6 md:block">
        {nav}
      </aside>
    </>
  );
}
