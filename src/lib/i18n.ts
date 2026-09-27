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
import enCity from "./i18n-keys/en/city.json";
import enCityWorld from "./i18n-keys/en/city-world.json";
import enLeaderboardRanks from "./i18n-keys/en/leaderboard-ranks.json";
import enMarketCards from "./i18n-keys/en/market-cards.json";
import enMiscMeta from "./i18n-keys/en/misc-meta.json";
import enMissionsGoddesses from "./i18n-keys/en/missions-goddesses.json";
import enOwnershipHome from "./i18n-keys/en/ownership-home.json";
import enSettingsOnboarding from "./i18n-keys/en/settings-onboarding.json";
import zhActionButtons from "./i18n-keys/zh/action-buttons.json";
import zhChatHistory from "./i18n-keys/zh/chat-history.json";
import zhCity from "./i18n-keys/zh/city.json";
import zhCityWorld from "./i18n-keys/zh/city-world.json";
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
  kinRemoteDesc: "— peer-to-peer remote desktop",
  landingCountdownPrefix: "{name} is",
  landingCountdownSuffix: "away from rooting the mainframe",
  howToPlay: "How to Play",
  landQuick1Label: "Hire",
  landQuick1Body: "avatars at their value — each hire raises it. Your first 10 hires get a 24h unbreakable lock.",
  landQuick2Label: "Overclock",
  landQuick2Body: "to double a value — your main engine. Firewalls block hires; breaches break a rival's firewall.",
  landQuick3Label: "Earn",
  landQuick3Body: "hourly: 0.2% of your portfolio, rank bonuses, plus The Banker's value every 24h.",
  landQuick4Label: "Grow",
  landQuick4Body: "your grid — every mission adds +50 hire slots and rewards a goddess card.",
  landQuick5Label: "Win",
  landQuick5Body: "by holding all Six goddesses for 1 hour — the simulation reboots and your name joins the Root Wall forever.",
  landChipGet: "GET",
  landChipOverclock: "OVERCLOCK",
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
  ...enCity,
  ...enCityWorld,
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
  kinRemoteDesc: "—— 点对点远程桌面",
  landingCountdownPrefix: "{name} 距离攻占主机还剩",
  landingCountdownSuffix: "",
  howToPlay: "游戏玩法",
  landQuick1Label: "雇佣：",
  landQuick1Body: "化身，身价随每次雇佣上涨。前 10 次雇佣自带 24 小时不可破解硬锁。",
  landQuick2Label: "超频：",
  landQuick2Body: "使身价翻倍——你的主要成长引擎。防火墙可屏蔽雇佣，击穿可破对手的防火墙。",
  landQuick3Label: "收益：",
  landQuick3Body: "每小时投资组合 0.2% 与段位奖金，每 24 小时还可领取银行家的身价。",
  landQuick4Label: "壮大：",
  landQuick4Body: "你的网格——每个任务 +50 雇佣位，并奖励一张六使卡。",
  landQuick5Label: "获胜：",
  landQuick5Body: "集齐六使并守住 1 小时，即可攻占主机——模拟系统重启，你的名字永铭根墙。",
  landChipGet: "雇佣",
  landChipOverclock: "超频",
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
  ...zhCity,
  ...zhCityWorld,
  ...zhLeaderboardRanks,
  ...zhMarketCards,
  ...zhMiscMeta,
  ...zhMissionsGoddesses,
  ...zhOwnershipHome,
  ...zhSettingsOnboarding,
};

export const translations: Record<Locale, TranslationKeys> = { en, zh };
