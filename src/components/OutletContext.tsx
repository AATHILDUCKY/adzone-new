"use client";

import { createContext, useContext, type ReactNode } from "react";

const OutletContext = createContext<unknown>(undefined);

export function OutletContextProvider({ value, children }: { value: unknown; children: ReactNode }) {
  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function useOutletContext<T>() {
  return useContext(OutletContext) as T;
}
