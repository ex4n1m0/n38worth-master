"use client";

import {
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  Trophy,
  ShieldAlert,
  ArrowRightLeft,
  Trash2,
  Ban,
  Gift,
  BookOpen,
} from "lucide-react";

const sections = [
  {
    icon: DollarSign,
    title: "Starting Out",
    items: [
      "Every new player starts with **100.00¢** credits.",
      "Your initial player value is **$1.00**.",
      "Use your credits to buy other players and grow your portfolio.",
    ],
  },
  {
    icon: Users,
    title: "Buying Players",
    items: [
      "To buy a player, you pay their current **player value** in credits.",
      "After being purchased, the player's value **doubles**.",
      "50% of the purchase price goes to the **previous owner**.",
      "The other 50% goes to the **purchased player** themselves.",
      "You can own a maximum of **111 players** at a time.",
      "You cannot buy yourself.",
    ],
  },
  {
    icon: ArrowRightLeft,
    title: "Sell Out (Self-Liberation)",
    items: [
      "If someone owns you, you can **sell yourself out** to become free.",
      "Your value is **halved** when you sell out.",
      "Your owner receives compensation based on your current value.",
    ],
  },
  {
    icon: Ban,
    title: "Block Sell",
    items: [
      "Owners can **block** a player they own from selling out.",
      "The block costs credits and lasts for a limited time.",
      "While blocked, the player **cannot** use Sell Out.",
    ],
  },
  {
    icon: Trash2,
    title: "Discarding Players",
    items: [
      "You can **discard** a player you own to free up a slot.",
      "The discarded player's value **resets to $1.00**.",
      "You can also **Discard All** owned players at once — you receive a small refund and all their values reset.",
      "Players with active sell blocks are skipped during Discard All.",
    ],
  },
  {
    icon: Gift,
    title: "Send Credits",
    items: [
      "You can send credits directly to any other player.",
      "This is a simple transfer — the amount is deducted from you and added to them.",
    ],
  },
  {
    icon: Clock,
    title: "Offline Penalty",
    items: [
      "If you are offline for more than **1 hour**, your credits start decaying.",
      "The decay rate is **1% per hour** (compounding).",
      "Formula: `new credits = old credits × 0.99 ^ hours offline`.",
      "Your credits will never drop below **1¢**.",
      "**Stay online to protect your wealth!**",
    ],
  },
  {
    icon: Trophy,
    title: "Rank Bonuses (Daily)",
    items: [
      "Every day, the **top 3 players** in each of 5 categories earn bonus credits:",
      "🥇 1st place: **$3** · 🥈 2nd place: **$2** · 🥉 3rd place: **$1**",
      "Categories: **Empire** (most players owned), **Legacy** (oldest account), **Credits** (most credits), **Value** (highest player value), **Portfolio** (total portfolio worth).",
    ],
  },
  {
    icon: TrendingUp,
    title: "Leaderboard Prizes",
    items: [
      "Periodic leaderboard prizes are distributed to top-ranked players.",
      "Climb the rankings to earn bonus credits automatically.",
    ],
  },
  {
    icon: ShieldAlert,
    title: "Rank Tiers",
    items: [
      "There are **5 rank categories**, each with **10 tiers**:",
      "**Empire** — based on how many players you own (Spectator → Emperor).",
      "**Legacy** — based on account age (Newborn → Eternal at 2+ years).",
      "**Credits** — based on your credit balance (Broke → Tycoon at 1M+).",
      "**Value** — based on your player worth (Nobody → Legend at 5,000+).",
      "**Portfolio** — based on total portfolio value (Empty → Sovereign at 1M+).",
    ],
  },
];

function renderMarkdown(text: string) {
  // Simple inline markdown: **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-gray-800 text-t1-400 px-1.5 py-0.5 rounded text-xs font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function RulesPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <BookOpen className="h-8 w-8 text-t1-400" />
          <h1 className="text-3xl font-bold text-white">Game Rules</h1>
        </div>
        <p className="text-gray-400 max-w-xl mx-auto">
          Everything you need to know about how n38worth works. Buy players,
          grow your portfolio, climb the ranks, and dominate the leaderboard.
        </p>
      </div>

      {/* Sections */}
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.title}
            className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-t1-600/20">
                <section.icon className="h-5 w-5 text-t1-400" />
              </div>
              <h2 className="text-lg font-bold text-white">{section.title}</h2>
            </div>
            <ul className="space-y-2">
              {section.items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-300"
                >
                  <span className="text-t1-400 mt-1 shrink-0">•</span>
                  <span>{renderMarkdown(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer tip */}
      <div className="text-center text-sm text-gray-500 pb-4">
        💡 Tip: Stay online, buy smart, and climb the ranks to earn daily
        bonuses!
      </div>
    </div>
  );
}
