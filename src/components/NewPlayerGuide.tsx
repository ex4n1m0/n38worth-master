"use client";

import { useState, useEffect } from "react";
import { X, Wallet, TrendingUp, Coins, Crown, Handshake, Target } from "lucide-react";

const STORAGE_KEY = "n38worth_new_player_guide_dismissed";
const GUIDE_STEPS = [
  {
    icon: Wallet,
    title: "Start with Credits",
    description: "You begin with 10 credits. Use them to build your portfolio!"
  },
  {
    icon: TrendingUp,
    title: "Buy Players",
    description: "Purchase other players at their current value. Each purchase makes them more valuable (+1 value)."
  },
  {
    icon: Coins,
    title: "Earn Revenue",
    description: "When someone buys a player you own, you get a share of the purchase price automatically!"
  },
  {
    icon: Handshake,
    title: "Get Purchased",
    description: "The key to wealth: encourage others to buy YOU! Each purchase increases your value by +1."
  },
  {
    icon: Target,
    title: "Grow Your Value",
    description: "The more people buy you, the higher your value climbs. Reach 100 for a ⭐ Star, 3333 for a 💎 Gem!"
  },
  {
    icon: Crown,
    title: "Compete",
    description: "Race to the top of the leaderboard and earn prizes!"
  }
];

export function NewPlayerGuide() {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the guide before
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      // Check if 24 hours have passed
      const expiry = parseInt(dismissed, 10);
      if (Date.now() > expiry) {
        // 24 hours passed, show the guide again
        localStorage.removeItem(STORAGE_KEY);
        setIsVisible(true);
      }
      // Otherwise, don't show (user dismissed within last 24 hours)
    } else {
      // No dismissal record, show the guide
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsClosing(true);
    // Store in localStorage for 24 hours
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    localStorage.setItem(STORAGE_KEY, expiry.toString());
    
    setTimeout(() => {
      setIsVisible(false);
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div className={`transition-all duration-300 ${isClosing ? 'opacity-0 -translate-y-4' : 'opacity-100'}`}>
      <div className="bg-gradient-to-r from-t1-900/40 via-gray-900/80 to-t2-900/40 rounded-xl border border-t1-500/20 overflow-hidden mb-6">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/50">
          <div>
            <h2 className="text-lg font-bold text-white">Welcome to n38worth! 🎮</h2>
            <p className="text-xs text-t1-300">Your goal: Build wealth by buying players and getting bought</p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            aria-label="Dismiss guide"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Steps Grid */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {GUIDE_STEPS.map((step, index) => (
              <div
                key={index}
                className="bg-gray-900/60 rounded-lg p-3 border border-gray-800 hover:border-t1-500/30 transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-t1-500/10">
                    <step.icon className="h-3.5 w-3.5 text-t1-400" />
                  </div>
                  <span className="text-[10px] font-semibold text-t1-400">{index + 1}</span>
                </div>
                <h3 className="font-semibold text-white text-xs mb-1">{step.title}</h3>
                <p className="text-[10px] text-gray-400 leading-tight">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 bg-gray-900/30 border-t border-gray-800/50 flex items-center justify-between">
          <p className="text-[10px] text-gray-500">This guide shows for 24 hours</p>
        </div>
      </div>
    </div>
  );
}
