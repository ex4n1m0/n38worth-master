"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { OnboardingState } from "@/types/onboarding";

const defaultState: OnboardingState = {
  avatarCompleted: false,
  marketUnlocked: false,
  starterNpcIds: [],
  starterNpcOwnedCount: 0,
  onboardingComplete: false,
  professionSelected: false,
};

interface OnboardingContextValue {
  state: OnboardingState;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  state: defaultState,
  loading: true,
  refresh: async () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    if (!session?.user?.id) {
      setState(defaultState);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch (error) {
      console.error("Failed to fetch onboarding state:", error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchState();
    } else if (status === "unauthenticated") {
      setState(defaultState);
      setLoading(false);
    }
  }, [status, fetchState]);

  return (
    <OnboardingContext.Provider
      value={{ state, loading, refresh: fetchState }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}