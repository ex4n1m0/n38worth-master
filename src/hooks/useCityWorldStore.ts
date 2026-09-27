"use client";

import { useSyncExternalStore } from "react";
import {
  cityWorldStore,
  type CityWorldState,
} from "@/lib/city/scene/store";

/**
 * Typed React binding for the vanilla city-world store.
 *
 * SELECTOR RULE: the selector must return a STABLE value (primitive, null,
 * or a reference the store replaces wholesale like `state.camera` /
 * `state.placeMode`). Never build fresh arrays/objects inside it — derive
 * composites with useMemo at the call site instead (useSyncExternalStore
 * compares snapshots with Object.is on every render).
 */
export function useCityWorldStore<T>(
  selector: (state: CityWorldState) => T
): T {
  return useSyncExternalStore(
    cityWorldStore.subscribe,
    () => selector(cityWorldStore.getState()),
    () => selector(cityWorldStore.getInitialState())
  );
}

/** Imperative access for event handlers (no subscription). */
export const getCityWorldStore = () => cityWorldStore.getState();
