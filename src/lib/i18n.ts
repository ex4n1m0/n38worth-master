/**
 * Simplified-Chinese localization (2026-09).
 *
 * Architecture decision (see CHINESE_I18N_STUDY.md): the whole game UI is
 * client-rendered ("use client" everywhere, react-query + Pusher), so a
 * lightweight client-side dictionary beats pulling in next-intl/i18next —
 * zero new dependencies, zero route changes, no middleware cost.
 *
 * Rules for contributors:
 * - NEVER hardcode user-visible English in components. Add a key here (en +
 *   zh must stay in lockstep — the `TranslationKeys` type enforces it) and
 *   read it via `const { t } = useLanguage()`.
 * - Interpolation: keep `{param}` placeholders in the value and substitute
 *   with `.replace("{param}", String(x))` chains at the call site.
 * - Plurals: use two keys (e.g. `player`/`players`) and pick with a ternary;
 *   zh has no plural forms.
 * - Locale-aware game vocabulary (goddess/profession/rank/mission names)
 *   lives next to its data in src/lib/{display-names,professions,ranks,
 *   missions-data}.ts, not here.
 * - Server-rendered strings (API error messages, DM receipts) are English in
 *   v1 — translating them needs error codes / a users.locale column
 *   (phase 2 in the study).
 */

export type Locale = "en" | "zh";

export const LOCALE_COOKIE = "n38-lang";
export const LOCALE_STORAGE_KEY = "n38-lang";

export const languageNames: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
};

export const languageFlags: Record<Locale, string> = {
  en: "🇬🇧",
  zh: "🇨🇳",
};

export const LOCALES: Locale[] = ["en", "zh"];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

/** Accepts browser tags like "zh-CN" / "en-US" and maps them to a Locale. */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("en")) return "en";
  return null;
}

// Sweep fragments (2026-09-24 string extraction): one en/zh JSON pair per
// UI surface batch. en files hold the exact pre-localization copy; zh files
// mirror them key-for-key (the TranslationKeys type enforces completeness).
import enActionButtons from "./i18n-keys/en/action-buttons.json";
import enChatHistory from "./i18n-keys/en/chat-history.json";
import enLeaderboardRanks from "./i18n-keys/en/leaderboard-ranks.json";
import enMarketCards from "./i18n-keys/en/market-cards.json";
import enMiscMeta from "./i18n-keys/en/misc-meta.json";
import enMissionsGoddesses from "./i18n-keys/en/missions-goddesses.json";
import enOwnershipHome from "./i18n-keys/en/ownership-home.json";
import enSettingsOnboarding from "./i18n-keys/en/settings-onboarding.json";
import zhActionButtons from "./i18n-keys/zh/action-buttons.json";
import zhChatHistory from "./i18n-keys/zh/chat-history.json";
import zhLeaderboardRanks from "./i18n-keys/zh/leaderboard-ranks.json";
import zhMarketCards from "./i18n-keys/zh/market-cards.json";
import zhMiscMeta from "./i18n-keys/zh/misc-meta.json";
import zhMissionsGoddesses from "./i18n-keys/zh/missions-goddesses.json";
import zhOwnershipHome from "./i18n-keys/zh/ownership-home.json";
import zhSettingsOnboarding from "./i18n-keys/zh/settings-onboarding.json";

const en = {
  // ── Landing page ──
  joinTitle: "Join n38worth",
  joinSubtitle: "Create your account and start trading avatars",
  username: "Username",
  password: "Password",
  confirmPassword: "Confirm Password",
  chooseUsername: "Choose a username",
  choosePassword: "Choose a password",
  confirmYourPassword: "Confirm your password",
  usernameHint: "3-30 characters, letters, numbers, and underscores only",
  createAccount: "Create Account",
  creatingAccount: "Creating account...",
  orContinueWith: "Or continue with",
  signUpGoogle: "Sign up with Google",
  connecting: "Connecting...",
  orTryInstantly: "Or try instantly",
  quickPlay: "Quick Play",
  creatingPlayer: "Creating player...",
  quickPlayHint: "Jack in instantly with a random avatar — no sign-up needed",
  alreadyHaveAccount: "Already have an account?",
  signIn: "Sign in",
  tributeNote: "This game is a tribute to",
  friendsForSale: "Friends for Sale",
  portfolioRankings: "Portfolio Rankings",
  contactDeveloper: "Contact Developer",
  noPlayersYet: "No avatars yet.",
  passwordsNoMatch: "Passwords do not match",
  registrationFailed: "Registration failed",
  somethingWrong: "Something went wrong. Please try again.",
  quickPlayFailed: "Quick play failed",

  landingTagline: "the human trading simulation",
  landingToggleSound: "Toggle sound",
  landingStartHere: "Start Here",
  kinLabel: "From the same maker",
  kinDeepfluxDesc: "— the AI-native media & download suite",
  kinOnlyhumansDesc: "— every word is a room",
  landingCountdownPrefix: "{name} is",
  landingCountdownSuffix: "away from rooting the mainframe",
  howToPlay: "How to Play",
  gettingStarted: "Getting Started",
  landStep1Title: "Create your avatar",
  landStep1Body: "Register, upload your avatar, pick a profession. Everyone starts equal: 100¢ and 20 hire slots.",
  landStep2Title: "Hire your first avatars",
  landStep2Body: "Hiring costs the avatar's value and overclocks it up. Your first 10 hires get a 24-hour unbreakable hard lock.",
  landStep3Title: "Get 20 avatars",
  landStep3Body: "Unlocks the full game: rankings, filters, feeds and missions. Each mission also adds +50 hire slots.",
  landStep4Title: "Claim your daily reward",
  landStep4Body: "Every 24h, claim The Banker's value — skimmed from the richest player. If that's you, no reward that day.",
  earningCredits: "Earning Credits",
  fourWaysToEarn: "Four ways to earn:",
  earn1Label: "Portfolio reward",
  earn1Body: "— 0.2% of your portfolio value, every hour.",
  earn2Label: "Getting hired",
  earn2Body: "— you get paid and your value rises when someone hires or overclocks you.",
  earn3Label: "Rank bonuses",
  earn3Body: "— top 3 in a ranking category pays hourly.",
  earn4Label: "Daily login reward",
  earn4Body: "— The Banker's value, every 24h.",
  landSkimNote: "Whoever owns your Avatar skims 10% of your portfolio reward. Hire slots cap how many Avatars you can hold — earn more from missions, poaching, and the 10 Slots Avatar.",
  theButtons: "The Buttons",
  landChipGet: "GET",
  landChipOverclock: "OVERCLOCK",
  landChipFirewall: "FIREWALL",
  landChipBreach: "BREACH",
  landChipHardLock: "HARD LOCK",
  landChipBotnet: "BOTNET",
  landChipSlots: "SLOTS",
  landChipScan: "SCAN",
  landGetBody: "Hire at current value. The avatar and its previous owner get paid, and its value jumps (2× under 1,000¢, tapering to 1.1× above 1M). Poaching also earns +1 hire slot.",
  landOverclockBody: "Pay 100% of value to double it, gift the cost to the avatar, extend its firewall 10 min (12h max). Your main growth engine.",
  landFirewallBody: "Shield from hires: +1 hour per press (12h max), +10% value, 90% of the cost paid to the Avatar.",
  landBreachBody: "Breach a rival's firewall by paying hours remaining × value to the owner. Hard-locked Avatars cost 1000×; unbreakable locks can't be breached.",
  landHardLockBody: "Your first 10 hires get a 24h unbreakable lock — movable between regular NPC Avatars, restarting the 24h.",
  bonusAvatars: "Bonus Avatars",
  landBotnetBody: "Bulk-hires the cheapest avatars — 1 + 10% of your owned count per press. Unlocks at 50 avatars. 10-min cooldown.",
  landSlotsBody: "+10 hire slots for 10% of your credits. 10-min cooldown.",
  landScanBody: "Decloaks every cloaked avatar for 10 minutes, for 10% of your credits. 10-min cooldown.",
  landAvatarAlt: "{chip} Avatar",
  professionsSection: "Professions: Perks & Combos",
  professionsIntro1: "Pick one for yourself, assign one to any NPC you own (and",
  professionsIntro2: "rename it once",
  professionsIntro3: "). Being a profession or owning its Avatar activates its perk:",
  comboLabel: "Combo:",
  comboBody: "sell one Avatar of each profession together for",
  comboHighlight: "10× their combined value",
  comboTail: "— overclock first, since the boosted value is what gets multiplied (your first sale also pays +50 hire slots). Firewalled Avatars can't be sold, and overclocking adds a firewall — so time the sale for when it expires. The Avatars reset to floor and 6 fresh NPCs spawn — but you lose the perks until you rebuild.",
  missionLadderTitle: "The Mission Ladder",
  missionLadderIntro: "Grow your grid to earn the Six (+50 hire slots per mission):",
  landLadder1: "Unlock the full game",
  landLadder2: "Botnet avatar",
  landLadder3: "The Banker",
  landLadder4: "The Oracle",
  landLadder5: "The Locksmith",
  landLadder6: "The Clockkeeper",
  landLadder7: "NullPointer",
  landLadder8: "The Architect (+1,000 per reboot)",
  landPowersNote: "Held daemons grant powers: The Banker doubles rewards, The Oracle decloaks cloaked avatars, The Locksmith hard-locks your team's firewalls (1000× breach fee), The Clockkeeper halves payout waits, NullPointer makes your breaches free and lets you destroy Avatars you own (deleting NPCs — 2 fresh ones spawn — or resetting a human to 1¢ and releasing them, with a 1-minute cooldown) — The Architect grants all at once.",
  rootingTitle: "Rooting the Mainframe",
  rootIntro: "Hold all Six to start a 1-hour countdown, visible to everyone. If a rival breaches one away, you have 2 minutes to take it back. Survive the hour and the simulation reboots — your name joins the Root Wall forever.",
  rootOutro: "Only one of each exists. The Six are never minted again — they are won through the mission ladder alone, and the powers above are why rivals will try to breach them away from you.",
  playNow: "Play Now",
  tryAsGuest: "Try as Guest",

  // ── Navbar ──
  signOut: "Sign Out",
  myProfile: "My Profile",
  settings: "Settings",
  navHome: "Home",
  navAvatars: "Avatars",
  navHistory: "History",
  navbarCredits: "Credits",
  navbarValue: "Value",
  navbarMyCredits: "My credits",
  navbarMyValue: "My value",
  muteSounds: "Mute sounds",
  unmuteSounds: "Unmute sounds",
  coachCredits: "Earn credits when other players hire your cards, plus portfolio rewards every 30 minutes. Your value grows every time you get hired.",

  // ── Language switcher ──
  language: "Language",

  // ── Global info bar ──
  totalPlayers: "Avatars",
  totalEconomy: "Economy",

  // ── Leaderboard / Dashboard ──
  myProfileSection: "My Profile",
  playerValue: "Avatar Value",
  credits: "Credits",
  portfolioValue: "Portfolio Value",
  selfInflate: "Self-Overclock",
  inflating: "Overclocking...",
  browsePlayers: "Browse Avatars",
  playersYouOwn: "Avatars You Own",
  yourOwners: "Your Boss",
  search: "Search",
  searchPlayers: "Search avatars...",
  sortBy: "Sort by",
  lastOnline: "Last Online",
  value: "Value",
  newest: "Newest",
  name: "Name",
  hasOwner: "Has Boss",
  noPlayersFound: "No avatars found.",
  previous: "Previous",
  next: "Next",
  page: "Page",
  of: "of",

  // ── Player profile ──
  joined: "Joined",
  lastSeen: "Last seen",
  owners: "Boss",
  owns: "Owns",
  hire: "Hire",
  hiring: "Hiring...",
  sellOut: "Sell Out",
  sellingOut: "Selling...",
  partner: "Partner",
  partnering: "Partnering...",
  unpartner: "Unpartner",
  unpartnering: "Unpartnering...",
  discard: "Discard",
  discarding: "Discarding...",
  sendCredits: "Send Credits",
  sending: "Sending...",
  chat: "Chat",
  directMessage: "Direct Message",
  loading: "Loading...",
  playerNotFound: "Avatar not found",
  inactiveWarning: "This account is inactive and may be deleted soon.",
  estimatedDeletion: "Estimated deletion",

  // ── Sell out dialog ──
  sellOutConfirmTitle: "Sell Out?",
  sellOutConfirmDesc: "Are you sure you want to sell yourself out from your boss? You will receive credits based on your current value.",
  sellOutConfirmButton: "Yes, Sell Out",
  cancel: "Cancel",

  // ── Discard dialog ──
  discardConfirmTitle: "Discard Avatar?",
  discardConfirmDesc: "Are you sure you want to discard this avatar? You will lose ownership.",
  discardConfirmButton: "Yes, Discard",

  // ── Discard all dialog ──
  discardAll: "Discard All",
  discardingAll: "Discarding All...",
  discardAllConfirmTitle: "Discard All Avatars?",
  discardAllConfirmDesc: "Are you sure you want to discard all {count} owned avatars? You will receive approximately {value}¢ and all their values will reset. Avatars with an active firewall will be skipped.",
  discardAllConfirmButton: "Yes, Discard All",

  // ── Settings ──
  settingsTitle: "Settings",
  changePassword: "Change Password",
  currentPassword: "Current Password",
  newPassword: "New Password",
  confirmNewPassword: "Confirm New Password",
  updatePassword: "Update Password",
  updatingPassword: "Updating...",
  uploadAvatar: "Upload Avatar",

  // ── Transactions ──
  transactionHistory: "Transaction History",
  noTransactions: "No transactions yet.",
  bought: "bought",
  sold: "sold",
  from: "from",
  to: "to",

  // ── New player guide ──
  guideTitle: "Welcome to n38worth! Here's how to get started:",
  guideStep1Title: "Start with Credits",
  guideStep1Desc: "You begin with 100.00¢ to hire avatars.",
  guideStep2Title: "Hire Avatars",
  guideStep2Desc: "Hire others to add them to your portfolio.",
  guideStep3Title: "Earn Revenue",
  guideStep3Desc: "When someone hires an avatar you own, you get a share of the hire price!",
  guideStep4Title: "Get Hired",
  guideStep4Desc: "When someone hires you, your value increases!",
  guideStep5Title: "Grow Your Value",
  guideStep5Desc: "Climb the leaderboard by growing your portfolio.",
  guideStep6Title: "Compete",
  guideStep6Desc: "Race to the top of the leaderboard and earn prizes!",

  // ── Auth pages ──
  loginTitle: "Welcome Back",
  loginSubtitle: "Sign in to your account",
  dontHaveAccount: "Don't have an account?",
  register: "Register",
  registerTitle: "Create Account",
  registerSubtitle: "Jack into the simulation and start trading",

  // ── Misc ──
  perMin: "/min",
  online: "Online",
  offline: "Offline",
  verified: "Verified",
  // Sweep fragments (see imports above).
  ...enActionButtons,
  ...enChatHistory,
  ...enLeaderboardRanks,
  ...enMarketCards,
  ...enMiscMeta,
  ...enMissionsGoddesses,
  ...enOwnershipHome,
  ...enSettingsOnboarding,
};

export type TranslationKeys = typeof en;

const zh: TranslationKeys = {
  // ── 落地页 ──
  joinTitle: "加入 n38worth",
  joinSubtitle: "创建账号，开始交易化身",
  username: "用户名",
  password: "密码",
  confirmPassword: "确认密码",
  chooseUsername: "选择用户名",
  choosePassword: "设置密码",
  confirmYourPassword: "再次输入密码",
  usernameHint: "3–30 个字符，仅限字母、数字和下划线",
  createAccount: "创建账号",
  creatingAccount: "正在创建账号…",
  orContinueWith: "或使用以下方式",
  signUpGoogle: "使用 Google 注册",
  connecting: "连接中…",
  orTryInstantly: "或立即体验",
  quickPlay: "快速开始",
  creatingPlayer: "正在创建玩家…",
  quickPlayHint: "一键接入随机化身——无需注册",
  alreadyHaveAccount: "已有账号？",
  signIn: "登录",
  tributeNote: "本游戏致敬",
  friendsForSale: "Friends for Sale",
  portfolioRankings: "投资组合排行",
  contactDeveloper: "联系开发者",
  noPlayersYet: "还没有化身。",
  passwordsNoMatch: "两次输入的密码不一致",
  registrationFailed: "注册失败",
  somethingWrong: "出错了，请重试。",
  quickPlayFailed: "快速开始失败",

  landingTagline: "人类交易模拟系统",
  landingToggleSound: "切换音效",
  landingStartHere: "从这里开始",
  kinLabel: "出自同一作者",
  kinDeepfluxDesc: "—— AI 原生的媒体与下载套件",
  kinOnlyhumansDesc: "—— 每个词都是一个房间",
  landingCountdownPrefix: "{name} 距离攻占主机还剩",
  landingCountdownSuffix: "",
  howToPlay: "游戏玩法",
  gettingStarted: "新手入门",
  landStep1Title: "创建你的化身",
  landStep1Body: "注册、上传头像、选择职业。所有人起点相同：100¢ 和 20 个雇佣位。",
  landStep2Title: "雇佣你的首批化身",
  landStep2Body: "雇佣花费等于化身当前身价，并使其身价上涨。你的前 10 次雇佣会获得 24 小时不可破解的硬锁。",
  landStep3Title: "集齐 20 个化身",
  landStep3Body: "解锁完整游戏：排行、筛选、动态和任务。每完成一个任务还奖励 +50 雇佣位。",
  landStep4Title: "领取每日奖励",
  landStep4Body: "每 24 小时可领取一次“银行家”的身价——从最富有的玩家身上抽取。如果那就是你，当天没有奖励。",
  earningCredits: "赚取信用点",
  fourWaysToEarn: "四种赚取方式：",
  earn1Label: "投资组合奖励",
  earn1Body: "—— 每小时获得投资组合价值的 0.2%。",
  earn2Label: "被雇佣",
  earn2Body: "—— 有人雇佣或超频你时，你会获得收入，身价也会上涨。",
  earn3Label: "段位奖金",
  earn3Body: "—— 在任一排行类别进入前 3 名，每小时发放。",
  earn4Label: "每日登录奖励",
  earn4Body: "—— 每 24 小时领取“银行家”的身价。",
  landSkimNote: "拥有你的化身的玩家会抽取你投资组合奖励的 10%。雇佣位限制你能持有多少化身——通过任务、挖角和“十个雇佣位”化身获得更多。",
  theButtons: "操作按钮",
  landChipGet: "雇佣",
  landChipOverclock: "超频",
  landChipFirewall: "防火墙",
  landChipBreach: "击穿",
  landChipHardLock: "硬锁",
  landChipBotnet: "僵尸网络",
  landChipSlots: "雇佣位",
  landChipScan: "扫描",
  landGetBody: "按当前身价雇佣。化身及其前任老板获得收入，化身身价跳涨（1,000¢ 以下 2 倍，100 万以上递减至 1.1 倍）。挖角还可获得 +1 雇佣位。",
  landOverclockBody: "支付 100% 身价使其翻倍，费用赠予化身本人，并延长其防火墙 10 分钟（上限 12 小时）。这是你的主要成长引擎。",
  landFirewallBody: "屏蔽雇佣：每按一次 +1 小时（上限 12 小时），+10% 身价，90% 的费用支付给化身本人。",
  landBreachBody: "击穿对手的防火墙：向其老板支付“剩余小时数 × 身价”。硬锁化身需要 1000 倍费用；不可破解的锁无法击穿。",
  landHardLockBody: "你的前 10 次雇佣自带 24 小时不可破解的锁——可在普通 NPC 化身之间转移，并重新计时 24 小时。",
  bonusAvatars: "特殊化身",
  landBotnetBody: "批量雇佣最便宜的化身——每次点击雇佣 1 + 已拥有数量的 10%。拥有 50 个化身后解锁。冷却 10 分钟。",
  landSlotsBody: "花费 10% 信用点换取 +10 雇佣位。冷却 10 分钟。",
  landScanBody: "花费 10% 信用点，解除所有隐匿化身的隐匿状态 10 分钟。冷却 10 分钟。",
  landAvatarAlt: "{chip}化身",
  professionsSection: "职业：加成与组合",
  professionsIntro1: "为自己选择一个职业，并可为你拥有的任意 NPC 指定一个（",
  professionsIntro2: "可改名一次",
  professionsIntro3: "）。成为该职业或拥有该职业的化身，即可激活对应加成：",
  comboLabel: "组合：",
  comboBody: "将每种职业各一个化身一起出售，可获得",
  comboHighlight: "它们总身价的 10 倍",
  comboTail: "——记得先超频，因为乘以 10 倍的是加成后的身价（首次组合出售还奖励 +50 雇佣位）。有防火墙的化身无法出售，而超频会附加防火墙——所以要掐准防火墙到期的时机出售。化身会重置为基础身价，并刷新 6 个新 NPC——但你需要重新收集才能恢复加成。",
  missionLadderTitle: "任务阶梯",
  missionLadderIntro: "壮大你的网格，赢取六使（每个任务 +50 雇佣位）：",
  landLadder1: "解锁完整游戏",
  landLadder2: "僵尸网络化身",
  landLadder3: "银行家",
  landLadder4: "先知",
  landLadder5: "锁匠",
  landLadder6: "守钟人",
  landLadder7: "空指针",
  landLadder8: "架构师（每次重启 +1,000）",
  landPowersNote: "持有守护者可获得能力：银行家使奖励翻倍，先知可识破隐匿化身，锁匠为你的队伍防火墙上硬锁（击穿费 1000 倍），守钟人使发放等待减半，空指针让你的击穿免费，并允许你摧毁自己拥有的化身（删除 NPC——会刷新 2 个新 NPC——或将人类玩家重置为 1¢ 并释放，冷却 1 分钟）——架构师则同时拥有全部能力。",
  rootingTitle: "攻占主机",
  rootIntro: "集齐全部六使将启动 1 小时倒计时，所有人可见。如果对手击穿抢走其一，你有 2 分钟夺回。撑过这一小时，模拟系统就会重启——你的名字将永远铭刻在根墙上。",
  rootOutro: "每一位六使都独一无二。六使绝不会再次铸造——只能通过任务阶梯赢取，而上面的这些能力，正是对手想从你手中击穿夺走它们的原因。",
  playNow: "立即游玩",
  tryAsGuest: "访客试玩",

  // ── 顶栏 ──
  signOut: "退出登录",
  myProfile: "我的资料",
  settings: "设置",
  navHome: "主页",
  navAvatars: "化身",
  navHistory: "历史",
  navbarCredits: "信用点",
  navbarValue: "身价",
  navbarMyCredits: "我的信用点",
  navbarMyValue: "我的身价",
  muteSounds: "静音",
  unmuteSounds: "取消静音",
  coachCredits: "其他玩家雇佣你的卡牌时你将获得信用点，此外每 30 分钟还有投资组合奖励。你每次被雇佣，身价都会上涨。",

  // ── 语言切换 ──
  language: "语言",

  // ── 全局信息栏 ──
  totalPlayers: "化身",
  totalEconomy: "经济总量",

  // ── 排行榜 / 仪表盘 ──
  myProfileSection: "我的资料",
  playerValue: "化身价值",
  credits: "信用点",
  portfolioValue: "投资组合价值",
  selfInflate: "自我超频",
  inflating: "超频中…",
  browsePlayers: "浏览化身",
  playersYouOwn: "你拥有的化身",
  yourOwners: "你的老板",
  search: "搜索",
  searchPlayers: "搜索化身…",
  sortBy: "排序",
  lastOnline: "最近在线",
  value: "身价",
  newest: "最新",
  name: "名称",
  hasOwner: "有老板",
  noPlayersFound: "未找到化身。",
  previous: "上一页",
  next: "下一页",
  page: "第",
  of: "页，共",

  // ── 玩家资料 ──
  joined: "加入于",
  lastSeen: "最后活跃",
  owners: "老板",
  owns: "拥有",
  hire: "雇佣",
  hiring: "雇佣中…",
  sellOut: "赎身",
  sellingOut: "赎身中…",
  partner: "搭档",
  partnering: "搭档中…",
  unpartner: "解除搭档",
  unpartnering: "解除中…",
  discard: "丢弃",
  discarding: "丢弃中…",
  sendCredits: "赠送信用点",
  sending: "发送中…",
  chat: "聊天",
  directMessage: "私信",
  loading: "加载中…",
  playerNotFound: "未找到该化身",
  inactiveWarning: "该账号已长期未活跃，可能很快会被删除。",
  estimatedDeletion: "预计删除时间",

  // ── 赎身确认 ──
  sellOutConfirmTitle: "赎身？",
  sellOutConfirmDesc: "确定要从老板那里赎身吗？你将根据当前身价获得信用点。",
  sellOutConfirmButton: "确认赎身",
  cancel: "取消",

  // ── 丢弃确认 ──
  discardConfirmTitle: "丢弃化身？",
  discardConfirmDesc: "确定要丢弃该化身吗？你将失去所有权。",
  discardConfirmButton: "确认丢弃",

  // ── 全部丢弃确认 ──
  discardAll: "全部丢弃",
  discardingAll: "正在全部丢弃…",
  discardAllConfirmTitle: "丢弃全部化身？",
  discardAllConfirmDesc: "确定要丢弃拥有的全部 {count} 个化身吗？你将获得约 {value}¢，且它们的身价将全部重置。带有活跃防火墙的化身将被跳过。",
  discardAllConfirmButton: "确认全部丢弃",

  // ── 设置 ──
  settingsTitle: "设置",
  changePassword: "修改密码",
  currentPassword: "当前密码",
  newPassword: "新密码",
  confirmNewPassword: "确认新密码",
  updatePassword: "更新密码",
  updatingPassword: "更新中…",
  uploadAvatar: "上传头像",

  // ── 交易 ──
  transactionHistory: "交易记录",
  noTransactions: "暂无交易。",
  bought: "买入",
  sold: "卖出",
  from: "来自",
  to: "给",

  // ── 新手指南 ──
  guideTitle: "欢迎来到 n38worth！快速上手：",
  guideStep1Title: "从信用点开始",
  guideStep1Desc: "你开局拥有 100.00¢，用于雇佣化身。",
  guideStep2Title: "雇佣化身",
  guideStep2Desc: "雇佣其他玩家，将其加入你的投资组合。",
  guideStep3Title: "赚取收益",
  guideStep3Desc: "有人雇佣你拥有的化身时，你可以分得雇佣收入！",
  guideStep4Title: "被雇佣",
  guideStep4Desc: "有人雇佣你时，你的身价会上涨！",
  guideStep5Title: "提升身价",
  guideStep5Desc: "壮大投资组合，攀登排行榜。",
  guideStep6Title: "参与竞争",
  guideStep6Desc: "冲上排行榜顶端，赢取奖励！",

  // ── 登录/注册 ──
  loginTitle: "欢迎回来",
  loginSubtitle: "登录你的账号",
  dontHaveAccount: "还没有账号？",
  register: "注册",
  registerTitle: "创建账号",
  registerSubtitle: "接入模拟系统，开始交易",

  // ── 其他 ──
  perMin: "/分钟",
  online: "在线",
  offline: "离线",
  verified: "已验证",
  // Sweep fragments (see imports above).
  ...zhActionButtons,
  ...zhChatHistory,
  ...zhLeaderboardRanks,
  ...zhMarketCards,
  ...zhMiscMeta,
  ...zhMissionsGoddesses,
  ...zhOwnershipHome,
  ...zhSettingsOnboarding,
};

export const translations: Record<Locale, TranslationKeys> = { en, zh };
