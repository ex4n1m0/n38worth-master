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
import enRaidBounties from "./i18n-keys/en/raid-bounties.json";
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
import zhRaidBounties from "./i18n-keys/zh/raid-bounties.json";

const en = {
  // ── Landing page ──
  joinTitle: "Join n38worth",
  joinSubtitle: "Create your account and start building your city",
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
  quickPlayHint: "Start building instantly with a random identity — no sign-up needed",
  alreadyHaveAccount: "Already have an account?",
  signIn: "Sign in",
  tributeNote: "This game is a tribute to",
  friendsForSale: "Friends for Sale",
  portfolioRankings: "Portfolio Rankings",
  contactDeveloper: "Contact Developer",
  noPlayersYet: "No buildings yet.",
  passwordsNoMatch: "Passwords do not match",
  registrationFailed: "Registration failed",
  somethingWrong: "Something went wrong. Please try again.",
  quickPlayFailed: "Quick play failed",

  landingTagline: "the city heist simulation",
  landingToggleSound: "Toggle sound",
  landingStartHere: "Start Here",
  kinLabel: "From the same maker",
  kinDeepfluxDesc: "— the AI-native media & download suite",
  kinOnlyhumansDesc: "— every word is a room",
  kinRemoteDesc: "— peer-to-peer remote desktop",
  landingCountdownPrefix: "{name} is",
  landingCountdownSuffix: "away from crowning the skyline",
  howToPlay: "How to Play",
  landQuick1Label: "Acquire",
  landQuick1Body: "buildings at their appraisal — every purchase raises one on your skyline and lifts its value. Your first 10 come with a 24-hour iron deed.",
  landQuick2Label: "Renovate",
  landQuick2Body: "to double a building's value — your main engine. Deed locks shield your towers; foreclosures crack a rival's so buildings change hands.",
  landQuick3Label: "Collect",
  landQuick3Body: "rent hourly: 0.2% of your portfolio, civic rank bonuses, plus The Banker's value every 24h.",
  landQuick4Label: "Grow",
  landQuick4Body: "your skyline in the City view — permits add +50 land plots and unlock new sectors; all six trades complete a district.",
  landQuick5Label: "Win",
  landQuick5Body: "by holding all six Founders' landmarks for 1 hour — they crown your city, the city is rebuilt, and your name joins the Cornerstone forever.",
  landChipGet: "ACQUIRE",
  landChipOverclock: "RENOVATE",
  playNow: "Play Now",
  tryAsGuest: "Try as Guest",

  // ── Navbar ──
  signOut: "Sign Out",
  myProfile: "My Profile",
  settings: "Settings",
  navHome: "Home",
  navAvatars: "Buildings",
  navHistory: "History",
  navbarCredits: "Capital",
  navbarValue: "Value",
  navbarMyCredits: "My capital",
  navbarMyValue: "My value",
  navBuildingsCatalog: "Buildings Catalog",

  // ── Buildings catalog (/catalog) ──
  catalogTitle: "Buildings Catalog",
  catalogSubtitle:
    "Every building family and tier in the city — acquire more, grow value, and watch them rise.",
  catalogSectionKit: "The collection — every 3D building model",
  catalogKitSuburban: "Suburban homes",
  catalogKitCommercial: "Commercial blocks",
  catalogKitIndustrial: "Industrial works",
  catalogKitSkyscraper: "Skyscrapers",
  catalogKitNote: "3D models: Kenney City Kit (CC0 — public domain)",
  catalogSectionFamilies: "Trade families × architecture league",
  catalogBandSuburban: "Levels 1–3 · homes",
  catalogBandCommercial: "Levels 4–7 · blocks",
  catalogBandSkyscraper: "Levels 8–14 · skyscrapers",
  catalogUnavailable: "3D building assets are unavailable on this device.",
  catalogSectionProtection: "Protection states",
  catalogSectionHq: "HQ core",
  catalogSectionLandmarks: "The Founders' landmarks",
  catalogUnassigned: "No trade",
  catalogNoProtection: "No protection",
  catalogFirewall: "DEED LOCK",
  catalogHardLock: "IRON DEED",
  catalogDay: "Day",
  catalogNight: "Night",
  catalogHqNoProfession: "Owner with no trade",
  catalogHqOwner: "Owner: {name}",
  catalogUnowned: "unowned",
  catalogStage: "Stage {n}",
  catalogStageLegend: "Final form appears only near the current game max value",

  // ── Building preview on avatar cards ──
  cardBuildingTier: "Becomes a Tier {tier} building in your city",
  cardBuildingLandmark: "Becomes a landmark in your city",
  muteSounds: "Mute sounds",
  unmuteSounds: "Unmute sounds",
  coachCredits: "Earn capital when other players acquire your cards, plus rent every 30 minutes. Your value grows every time you get acquired.",

  // ── Language switcher ──
  language: "Language",

  // ── Global info bar ──
  totalPlayers: "Buildings",
  totalEconomy: "Economy",

  // ── Leaderboard / Dashboard ──
  myProfileSection: "My Profile",
  playerValue: "Building Value",
  credits: "Capital",
  portfolioValue: "Portfolio Value",
  selfInflate: "Self-Renovate",
  inflating: "Renovating...",
  browsePlayers: "Browse Buildings",
  playersYouOwn: "Buildings You Own",
  yourOwners: "Your Landlord",
  search: "Search",
  searchPlayers: "Search buildings...",
  sortBy: "Sort by",
  lastOnline: "Last Online",
  value: "Value",
  newest: "Newest",
  name: "Name",
  hasOwner: "Has Landlord",
  noPlayersFound: "No buildings found.",
  previous: "Previous",
  next: "Next",
  page: "Page",
  of: "of",

  // ── Player profile ──
  joined: "Joined",
  lastSeen: "Last seen",
  owners: "Landlord",
  owns: "Owns",
  hire: "Acquire",
  hiring: "Acquiring...",
  sellOut: "Redeem",
  sellingOut: "Redeeming...",
  partner: "Partner",
  partnering: "Partnering...",
  unpartner: "Unpartner",
  unpartnering: "Unpartnering...",
  discard: "Discard",
  discarding: "Discarding...",
  sendCredits: "Send Capital",
  sending: "Sending...",
  chat: "Chat",
  directMessage: "Direct Message",
  loading: "Loading...",
  playerNotFound: "Building not found",
  inactiveWarning: "This account is inactive and may be deleted soon.",
  estimatedDeletion: "Estimated deletion",

  // ── Redeem dialog ──
  sellOutConfirmTitle: "Redeem?",
  sellOutConfirmDesc: "Are you sure you want to redeem your deed from your landlord? You will receive capital based on your current value.",
  sellOutConfirmButton: "Yes, Redeem",
  cancel: "Cancel",

  // ── Discard dialog ──
  discardConfirmTitle: "Discard Building?",
  discardConfirmDesc: "Are you sure you want to discard this building? You will lose ownership.",
  discardConfirmButton: "Yes, Discard",

  // ── Discard all dialog ──
  discardAll: "Discard All",
  discardingAll: "Discarding All...",
  discardAllConfirmTitle: "Discard All Buildings?",
  discardAllConfirmDesc: "Are you sure you want to discard all {count} owned buildings? You will receive approximately {value}¢ and all their values will reset. Buildings with an active deed lock will be skipped.",
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
  guideStep1Title: "Start with Capital",
  guideStep1Desc: "You begin with 100.00¢ to acquire buildings.",
  guideStep2Title: "Acquire Buildings",
  guideStep2Desc: "Acquire others to add them to your portfolio.",
  guideStep3Title: "Earn Revenue",
  guideStep3Desc: "When someone acquires a building you own, you get a share of the price!",
  guideStep4Title: "Get Acquired",
  guideStep4Desc: "When someone acquires you, your value increases!",
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
  registerSubtitle: "Claim your plot and start building",

  // ── Misc ──
  perMin: "/min",
  online: "Online",
  offline: "Offline",
  verified: "Verified",
  // ── Chat room (public) ──
  publicMessagePlaceholder: "Type a public message to earn capital...",
  publicMessageAria: "Public chat message",
  sendPublicMessageAria: "Send public message",
  chatCleared: "Chat cleared",
  // ── Demo play ──
  demoPlayLabel: "DEMO PLAY",
  demoPlayersDeletedNote: "Demo players are automatically deleted after 1 hour",
  demoSignInFailed: "Failed to sign in as demo player",
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
  ...enRaidBounties,
};

export type TranslationKeys = typeof en;

const zh: TranslationKeys = {
  // ── 落地页 ──
  joinTitle: "加入 n38worth",
  joinSubtitle: "创建账号，开始建造你的城市",
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
  quickPlayHint: "一键随机身份开工——无需注册",
  alreadyHaveAccount: "已有账号？",
  signIn: "登录",
  tributeNote: "本游戏致敬",
  friendsForSale: "Friends for Sale",
  portfolioRankings: "物业排行",
  contactDeveloper: "联系开发者",
  noPlayersYet: "还没有建筑。",
  passwordsNoMatch: "两次输入的密码不一致",
  registrationFailed: "注册失败",
  somethingWrong: "出错了，请重试。",
  quickPlayFailed: "快速开始失败",

  landingTagline: "城市劫案模拟",
  landingToggleSound: "切换音效",
  landingStartHere: "从这里开始",
  kinLabel: "出自同一作者",
  kinDeepfluxDesc: "—— AI 原生的媒体与下载套件",
  kinOnlyhumansDesc: "—— 每个词都是一个房间",
  kinRemoteDesc: "—— 点对点远程桌面",
  landingCountdownPrefix: "{name} 距离加冕天际线还剩",
  landingCountdownSuffix: "",
  howToPlay: "游戏玩法",
  landQuick1Label: "收购：",
  landQuick1Body: "建筑，按估值购入——每次收购都会在你的天际线上立起一座新楼并推高其价值。前 10 座自带 24 小时铁契。",
  landQuick2Label: "翻新：",
  landQuick2Body: "让建筑估值翻倍——你的主要成长引擎。契锁守护你的高楼，法拍击破对手的契约即可夺楼。",
  landQuick3Label: "收租：",
  landQuick3Body: "每小时收租——物业总值的 0.2% 与市政奖励，每 24 小时还可领取银行家的身价分红。",
  landQuick4Label: "壮大：",
  landQuick4Body: "城市视图中的天际线——许可 +50 地块并解锁新分区，集齐六大行业点亮一座行业城区。",
  landQuick5Label: "获胜：",
  landQuick5Body: "集齐六位奠基人地标并守住 1 小时——地标为你的城市加冕，城市重建，你的名字永铭奠基石。",
  landChipGet: "收购",
  landChipOverclock: "翻新",
  playNow: "立即游玩",
  tryAsGuest: "访客试玩",

  // ── 顶栏 ──
  signOut: "退出登录",
  myProfile: "我的资料",
  settings: "设置",
  navHome: "主页",
  navAvatars: "建筑",
  navHistory: "历史",
  navbarCredits: "资金",
  navbarValue: "估值",
  navbarMyCredits: "我的资金",
  navbarMyValue: "我的估值",
  navBuildingsCatalog: "建筑图鉴",

  // ── 建筑图鉴（/catalog）──
  catalogTitle: "建筑图鉴",
  catalogSubtitle:
    "城市中的全部建筑家族与层级——收购更多建筑、推高估值，看着它们拔地而起。",
  catalogSectionKit: "建筑全集 —— 所有 3D 建筑模型",
  catalogKitSuburban: "住宅小楼",
  catalogKitCommercial: "商业街区",
  catalogKitIndustrial: "工业厂房",
  catalogKitSkyscraper: "摩天大楼",
  catalogKitNote: "3D 模型：Kenney City Kit（CC0 公有领域）",
  catalogSectionFamilies: "行业家族 × 建筑梯队",
  catalogBandSuburban: "1–3 级 · 住宅",
  catalogBandCommercial: "4–7 级 · 商业",
  catalogBandSkyscraper: "8–14 级 · 摩天楼",
  catalogUnavailable: "此设备无法加载 3D 建筑素材。",
  catalogSectionProtection: "保护状态",
  catalogSectionHq: "总部核心",
  catalogSectionLandmarks: "奠基人地标",
  catalogUnassigned: "无行业",
  catalogNoProtection: "无保护",
  catalogFirewall: "契锁",
  catalogHardLock: "铁契",
  catalogDay: "白天",
  catalogNight: "夜晚",
  catalogHqNoProfession: "业主无行业",
  catalogHqOwner: "业主：{name}",
  catalogUnowned: "未拥有",
  catalogStage: "阶段 {n}",
  catalogStageLegend: "最终形态只在接近当前游戏最高估值时出现",

  // ── 卡牌上的建筑预览 ──
  cardBuildingTier: "将在我方城市中建成 {tier} 级建筑",
  cardBuildingLandmark: "将在我方城市中成为地标",
  muteSounds: "静音",
  unmuteSounds: "取消静音",
  coachCredits: "其他玩家收购你的卡牌时你将获得资金，此外每 30 分钟还有一次收租。你每次被收购，估值都会上涨。",

  // ── 语言切换 ──
  language: "语言",

  // ── 全局信息栏 ──
  totalPlayers: "建筑",
  totalEconomy: "经济总量",

  // ── 排行榜 / 仪表盘 ──
  myProfileSection: "我的资料",
  playerValue: "建筑价值",
  credits: "资金",
  portfolioValue: "物业总值",
  selfInflate: "自我翻新",
  inflating: "翻新中…",
  browsePlayers: "浏览建筑",
  playersYouOwn: "你拥有的建筑",
  yourOwners: "你的房东",
  search: "搜索",
  searchPlayers: "搜索建筑…",
  sortBy: "排序",
  lastOnline: "最近在线",
  value: "估值",
  newest: "最新",
  name: "名称",
  hasOwner: "有房东",
  noPlayersFound: "未找到建筑。",
  previous: "上一页",
  next: "下一页",
  page: "第",
  of: "页，共",

  // ── 玩家资料 ──
  joined: "加入于",
  lastSeen: "最后活跃",
  owners: "房东",
  owns: "拥有",
  hire: "收购",
  hiring: "收购中…",
  sellOut: "赎回",
  sellingOut: "赎回中…",
  partner: "搭档",
  partnering: "搭档中…",
  unpartner: "解除搭档",
  unpartnering: "解除中…",
  discard: "丢弃",
  discarding: "丢弃中…",
  sendCredits: "赠送资金",
  sending: "发送中…",
  chat: "聊天",
  directMessage: "私信",
  loading: "加载中…",
  playerNotFound: "未找到该建筑",
  inactiveWarning: "该账号已长期未活跃，可能很快会被删除。",
  estimatedDeletion: "预计删除时间",

  // ── 赎回确认 ──
  sellOutConfirmTitle: "赎回？",
  sellOutConfirmDesc: "确定要向房东赎回你的契据吗？你将根据当前估值获得资金。",
  sellOutConfirmButton: "确认赎回",
  cancel: "取消",

  // ── 丢弃确认 ──
  discardConfirmTitle: "丢弃建筑？",
  discardConfirmDesc: "确定要丢弃该建筑吗？你将失去所有权。",
  discardConfirmButton: "确认丢弃",

  // ── 全部丢弃确认 ──
  discardAll: "全部丢弃",
  discardingAll: "正在全部丢弃…",
  discardAllConfirmTitle: "丢弃全部建筑？",
  discardAllConfirmDesc: "确定要丢弃拥有的全部 {count} 个建筑吗？你将获得约 {value}¢，且它们的估值将全部重置。带有契锁的建筑将被跳过。",
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
  guideStep1Title: "从资金开始",
  guideStep1Desc: "你开局拥有 100.00¢，用于收购建筑。",
  guideStep2Title: "收购建筑",
  guideStep2Desc: "收购其他玩家，将其纳入你的物业。",
  guideStep3Title: "赚取收益",
  guideStep3Desc: "有人收购你拥有的建筑时，你可以分得收购收入！",
  guideStep4Title: "被收购",
  guideStep4Desc: "有人收购你时，你的估值会上涨！",
  guideStep5Title: "提升估值",
  guideStep5Desc: "壮大物业，攀登排行榜。",
  guideStep6Title: "参与竞争",
  guideStep6Desc: "冲上排行榜顶端，赢取奖励！",

  // ── 登录/注册 ──
  loginTitle: "欢迎回来",
  loginSubtitle: "登录你的账号",
  dontHaveAccount: "还没有账号？",
  register: "注册",
  registerTitle: "创建账号",
  registerSubtitle: "领取你的地块，开始建造",

  // ── 其他 ──
  perMin: "/分钟",
  online: "在线",
  offline: "离线",
  verified: "已验证",
  // ── 公共聊天 ──
  publicMessagePlaceholder: "输入公开消息即可赚取资金…",
  publicMessageAria: "公开聊天消息",
  sendPublicMessageAria: "发送公开消息",
  chatCleared: "聊天已清空",
  // ── 访客试玩 ──
  demoPlayLabel: "访客试玩",
  demoPlayersDeletedNote: "访客账号将在 1 小时后自动删除",
  demoSignInFailed: "访客登录失败",
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
  ...zhRaidBounties,
};

export const translations: Record<Locale, TranslationKeys> = { en, zh };
