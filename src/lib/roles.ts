"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Role } from "./search";

export const ROLE_LABELS: Record<Role, string> = {
  partner: "Партнер",
  lawyer: "Юрист",
  assistant: "Помічник юриста",
  hr: "HR-менеджер",
};

const STORAGE_KEY = "kb-role";
const DEFAULT_ROLE: Role = "assistant";

function isRole(value: unknown): value is Role {
  return (
    value === "partner" ||
    value === "lawyer" ||
    value === "assistant" ||
    value === "hr"
  );
}

// A tiny external store backed by localStorage, read via useSyncExternalStore
// so the role survives a page reload without a hydration mismatch (the
// server snapshot always reports the default; the client snapshot lazily
// reads localStorage on first access and again whenever setRole runs).
type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRole: Role = DEFAULT_ROLE;
let hydrated = false;

function readStoredRole(): Role {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isRole(stored) ? stored : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Role {
  if (!hydrated) {
    cachedRole = readStoredRole();
    hydrated = true;
  }
  return cachedRole;
}

function getServerSnapshot(): Role {
  return DEFAULT_ROLE;
}

function setStoredRole(next: Role): void {
  cachedRole = next;
  hydrated = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage unavailable (e.g. privacy mode) — state still updates in memory.
  }
  for (const listener of listeners) listener();
}

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const role = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setRole = useCallback((next: Role) => setStoredRole(next), []);
  const value = useMemo(() => ({ role, setRole }), [role, setRole]);

  return createElement(RoleContext.Provider, { value }, children);
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return ctx;
}
