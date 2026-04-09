# User Value Display on Leaderboard Page

## Overview
The user value is displayed in multiple locations on the https://n38worth.com/leaderboard page, depending on the view mode and context.

## Locations Where User Value is Displayed

### 1. Leaderboard Page (Main Component)
**File:** `src/app/(game)/leaderboard/page.tsx`

#### Mosaic View (Default)
- **Location:** Bottom overlay of each player card
- **Display:** `₡{player.playerValue?.toLocaleString()}`
- **Styling:** `text-gray-300 text-[30px] sm:text-[36px]`
- **Additional Info:** Shows owner count with crown icon if `player.ownerCount > 0`

#### Details View
- **Location:** Uses `PlayerCard` component
- **Display:** See PlayerCard section below

### 2. PlayerCard Component
**File:** `src/components/PlayerCard.tsx`

The player value is displayed in **three locations** within the PlayerCard:

#### a) Top Right Badge
```jsx
<Badge className="bg-t1-500/10 text-t1-400 border-t1-500/20 font-mono text-xs">
  {playerValue}¢
</Badge>
```

#### b) Buy Button
```jsx
<Button className="bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white text-xs sm:text-sm font-bold">
  <ShoppingCart className="h-3.5 w-3.5 mr-1" />
  Buy {playerValue}¢
</Button>
```

#### c) Stats Row
The player value is **no longer** displayed in the Stats Row. The Stats Row now only shows:
- Owner count with crown icon
- Owned count with Users icon
- Portfolio value (if available)
- Credits (if available)

### 3. MyProfileCard Component
**File:** `src/components/MyProfileCard.tsx`

This component displays the **current user's** profile when logged in. The player value display with TrendingUp icon has been **removed**. The component now shows:
- Credits
- Portfolio value
- Owner count
- Player count

## Summary

The user value appears in **multiple locations** on the leaderboard page:

1. **Leaderboard Grid (Mosaic View):** Large text overlay on each player card
2. **PlayerCard (Details View):** Badge and buy button (value removed from stats row)
3. **MyProfileCard:** Value display with TrendingUp icon has been removed

All displays use the `playerValue` property from the player data, formatted with the `₡` or `¢` currency symbol.
