# NetWorth — MMO Social Trading Game

A **Massive Multiplayer Online Social Trading Game** where players buy, own, and trade each other using an in-game credit economy. Built on Vercel's serverless infrastructure.

## 🎮 Game Rules

| Rule | Details |
|---|---|
| **Starting Value** | Every player starts with a value of **1** |
| **Starting Credits** | Every player starts with **10 credits** |
| **Avatar Bonus** | Upload your first profile picture → earn **+10 credits** |
| **Purchase Cost** | Cost = target's current player value |
| **After Purchase** | Target's value **doubles** (×2) |
| **Revenue Sharing** | Purchase price ÷ number of existing owners (split equally) |
| **Sell / Discard** | Receive the player's current value in credits; their value resets to their **floor** (min 1) |
| **Sell Block (after sell)** | After selling, **all remaining owners** of that player are blocked from selling for **24 hours** |
| **Block Sell (action)** | Pay **12× player value per owner** to block that owner from selling you for **12 hours** — payment goes to the blocked owner |
| **Hourly Inflation** | Every player's value increases by **+1 per hour** automatically |
| **Dividends** | Earn **0.01¢ × owner count** per minute for each player you own |
| **⭐ Star Milestone** | Reach **100 value** → Star badge, value floor rises to **10** |
| **💎 Gem Milestone** | Reach **1000 value** → Gem badge, value floor rises to **100** |
| **Chat (Public)** | Send a message to the public chat for **10¢** (max 280 chars) |
| **Chat (Private)** | Send a private message to any player for **1¢** (max 280 chars) |
| **Inactivity Penalty** | Offline for **24+ hours** → lose **1 credit and 1 value per hour** |
| **Ownership** | Unlimited owners per player, unlimited owned players |

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Neon Serverless Postgres
- **ORM**: Drizzle ORM
- **Auth**: NextAuth.js v5 (Credentials Provider)
- **Real-time**: Pusher Channels
- **Image Storage**: Vercel Blob
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand + TanStack Query
- **Deployment**: Vercel

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) database
- A [Pusher](https://pusher.com) Channels app
- A [Vercel](https://vercel.com) account (for Blob storage)

### Setup

1. **Clone and install**:
   ```bash
   git clone <repo-url>
   cd networth
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your credentials in `.env.local`.

3. **Push database schema**:
   ```bash
   npm run db:push
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

### Database Commands

```bash
npm run db:generate  # Generate migration files
npm run db:migrate   # Run migrations
npm run db:push      # Push schema directly (dev)
npm run db:studio    # Open Drizzle Studio
```

## 📁 Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login & Register pages
│   ├── (game)/           # Protected game pages
│   │   ├── dashboard/    # Player home
│   │   ├── players/      # Browse & profile pages
│   │   ├── leaderboard/  # Rankings
│   │   ├── transactions/ # Trade history
│   │   └── settings/     # Account settings
│   └── api/              # API routes
├── actions/              # Server Actions (purchase, discard)
├── components/           # React components
├── db/                   # Database schema & client
├── hooks/                # Custom React hooks
├── lib/                  # Auth, Pusher, validators
└── types/                # TypeScript declarations
```

## 🔒 Security

- bcrypt password hashing (cost factor 12)
- Drizzle ORM parameterized queries
- Zod input validation
- JWT session strategy
- CSRF protection via NextAuth.js
- Image upload validation (type + size limits)

## 📦 Deployment

Deploy to Vercel:

```bash
vercel
```

Set all environment variables in Vercel dashboard, then:

```bash
vercel --prod
```

## License

MIT
