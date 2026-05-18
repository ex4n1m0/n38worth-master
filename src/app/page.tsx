"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CoverVariant = "16-9" | "1-1" | "9-16";

interface ButtonConfig {
  left: string;
  top: string;
  width: string;
  height: string;
}

interface CoverConfig {
  src: string;
  alt: string;
  aspectRatio: string;
  buttons: {
    about: ButtonConfig;
    login: ButtonConfig;
    support: ButtonConfig;
  };
}

const COVER_CONFIGS: Record<CoverVariant, CoverConfig> = {
  "16-9": {
    src: "/Cover169.png",
    alt: "Game Cover - Landscape",
    aspectRatio: "16/9",
    buttons: {
      about: { left: "4%", top: "87%", width: "30%", height: "11%" },
      login: { left: "35%", top: "87%", width: "30%", height: "11%" },
      support: { left: "66%", top: "87%", width: "30%", height: "11%" },
    },
  },
  "1-1": {
    src: "/Cover11.png",
    alt: "Game Cover - Square",
    aspectRatio: "1/1",
    buttons: {
      about: { left: "4%", top: "88%", width: "30%", height: "10%" },
      login: { left: "35%", top: "88%", width: "30%", height: "10%" },
      support: { left: "66%", top: "88%", width: "30%", height: "10%" },
    },
  },
  "9-16": {
    src: "/Cover916.png",
    alt: "Game Cover - Portrait",
    aspectRatio: "9/16",
    buttons: {
      about: { left: "5%", top: "89%", width: "28%", height: "9%" },
      login: { left: "36%", top: "89%", width: "28%", height: "9%" },
      support: { left: "67%", top: "89%", width: "28%", height: "9%" },
    },
  },
};

function useCoverVariant(): CoverVariant {
  const [variant, setVariant] = useState<CoverVariant>("16-9");

  useEffect(() => {
    const updateVariant = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = width / height;

      if (ratio > 1.3) {
        setVariant("16-9");
      } else if (ratio < 0.7) {
        setVariant("9-16");
      } else {
        setVariant("1-1");
      }
    };

    updateVariant();
    window.addEventListener("resize", updateVariant);
    return () => window.removeEventListener("resize", updateVariant);
  }, []);

  return variant;
}

export default function Home() {
  const [gameplayOpen, setGameplayOpen] = useState(false);
  const coverVariant = useCoverVariant();
  const coverConfig = COVER_CONFIGS[coverVariant];

  const { data: humanCountData } = useQuery<{ count: number }>({
    queryKey: ["human-count"],
    queryFn: async () => {
      const res = await fetch("/api/players/human-count");
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-gray-950 flex items-start justify-center">
      <div className="relative overflow-hidden w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-t1-600/10 via-transparent to-t2-600/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-t1-500/5 rounded-full blur-3xl" />

        {/* Game Cover — responsive image with invisible hotspots */}
        <div className="relative z-10 w-full flex justify-center px-4 sm:px-6 lg:px-8 pt-8 pb-0">
          <div className="w-full max-w-full">
            <div className="relative overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverConfig.src}
                alt={coverConfig.alt}
                className="w-full h-auto max-h-[85vh] object-contain block mx-auto"
              />
              {/* About button - opens How to Play dialog */}
              <button
                type="button"
                onClick={() => setGameplayOpen(true)}
                aria-label="About"
                className="absolute cursor-pointer bg-transparent border-0 p-0 group"
                style={{
                  left: coverConfig.buttons.about.left,
                  top: coverConfig.buttons.about.top,
                  width: coverConfig.buttons.about.width,
                  height: coverConfig.buttons.about.height,
                }}
              >
                <span className="absolute bottom-[50%] left-[50%] -translate-x-1/2 translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-semibold px-3 py-1 bg-black/60 text-white rounded-full whitespace-nowrap pointer-events-none">
                  About →
                </span>
              </button>
              {/* Login button - links to register */}
              <a
                href="https://n38worth.com/register"
                aria-label="Login"
                className="absolute cursor-pointer group"
                style={{
                  left: coverConfig.buttons.login.left,
                  top: coverConfig.buttons.login.top,
                  width: coverConfig.buttons.login.width,
                  height: coverConfig.buttons.login.height,
                }}
              >
                <span className="absolute bottom-[50%] left-[50%] -translate-x-1/2 translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-semibold px-3 py-1 bg-black/60 text-white rounded-full whitespace-nowrap pointer-events-none">
                  Login →
                </span>
              </a>
              {/* Support button - links to LinkedIn */}
              <a
                href="https://www.linkedin.com/in/igorcarlier/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Support"
                className="absolute cursor-pointer group"
                style={{
                  left: coverConfig.buttons.support.left,
                  top: coverConfig.buttons.support.top,
                  width: coverConfig.buttons.support.width,
                  height: coverConfig.buttons.support.height,
                }}
              >
                <span className="absolute bottom-[50%] left-[50%] -translate-x-1/2 translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-semibold px-3 py-1 bg-black/60 text-white rounded-full whitespace-nowrap pointer-events-none">
                  Support →
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Game Play Modal */}
        <Dialog open={gameplayOpen} onOpenChange={setGameplayOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 border-gray-700 text-gray-100">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center">How to Play</DialogTitle>
            </DialogHeader>
            {humanCountData && humanCountData.count > 0 && (
              <p className="text-center text-t1-400 text-3xl font-bold mt-4 mb-2">
                {humanCountData.count} Players already joined
              </p>
            )}
            <div className="space-y-6 py-4">
              {/* What is n38worth? */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-3">What is n38worth?</h3>
                <div className="space-y-2 text-gray-300 text-sm">
                  <p>It&apos;s a social game of connection and ambition, where you gather people around you and grow something that feels like your own little world. Every player carries a spark of value, and together, those sparks can become something extraordinary.</p>
                </div>
              </section>

              {/* Getting Started */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-3">Getting Started</h3>
                <div className="space-y-2 text-gray-300 text-sm">
                  <p>You begin with just a handful of credits—humble, but full of possibility. Everyone starts small, equal at first. As you shape your presence and reveal who you are, your worth begins to rise, drawing others toward you.</p>
                </div>
              </section>

              {/* How to Play */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-3">How to Play</h3>
                <div className="space-y-2 text-gray-300 text-sm">
                  <p>You invite others into your circle, and as your bond grows, so does their value—and yours. Some connections flourish quickly, others more slowly, but each one changes the shape of your journey.</p>
                  <p>If a path no longer feels right, you can let someone go, watching them return to their beginnings.</p>
                  <p>And when others choose you, when they see something worth holding onto, you gain from their belief in you.</p>
                  <p>Over time, your network becomes something alive—quietly growing, rewarding your attention and care.</p>
                </div>
              </section>

              {/* The Goal */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-3">The Goal</h3>
                <div className="space-y-2 text-gray-300 text-sm">
                  <p>Hidden within the game are six legendary figures—Goddesses of power and mystery. To find them, to gather them, and to keep them close until time runs out… that is the ultimate pursuit.</p>
                  <p>Those who succeed leave their mark, remembered among the greats.</p>
                </div>
              </section>

            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}