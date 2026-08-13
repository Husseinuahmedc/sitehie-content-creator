"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny dependency-free external store (no zustand/redux/jotai).
 *
 * `useStore` subscribes a component to a selector of the state. Selectors must
 * return stable references (an existing slice/field from the current state),
 * never freshly-constructed values, so `useSyncExternalStore`'s snapshot check
 * bails out when nothing the component reads actually changed.
 */
export type ExternalStore<State> = {
  getState: () => State;
  setState: (updater: (prev: State) => State) => void;
  subscribe: (listener: () => void) => () => void;
  useStore: <Slice>(selector: (state: State) => Slice) => Slice;
};

export function createStore<State>(initialState: State): ExternalStore<State> {
  let state: State = initialState;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState = (updater: (prev: State) => State) => {
    const next = updater(state);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const useStore: ExternalStore<State>["useStore"] = (selector) =>
    useSyncExternalStore(
      subscribe,
      () => selector(getState()),
      () => selector(getState())
    );

  return { getState, setState, subscribe, useStore };
}

/** Resolves a plain value or an (updater) — the store equivalent of React's functional setState. */
export function resolveValue<T>(value: T | ((prev: T) => T), prev: T): T {
  return typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
}