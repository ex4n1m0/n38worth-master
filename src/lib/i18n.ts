export const languageNames: Record<string, string> = {
  en: "English",
};

export const languageFlags: Record<string, string> = {
  en: "🇬🇧",
};

type TranslationKeys = {
  // Landing page
  joinTitle: string;
  joinSubtitle: string;
  username: string;
  password: string;
  confirmPassword: string;
  chooseUsername: string;
  choosePassword: string;
  confirmYourPassword: string;
  usernameHint: string;
  createAccount: string;
  creatingAccount: string;
  orContinueWith: string;
  signUpGoogle: string;
  connecting: string;
  orTryInstantly: string;
  quickPlay: string;
  creatingPlayer: string;
  quickPlayHint: string;
  alreadyHaveAccount: string;
  signIn: string;
  tributeNote: string;
  friendsForSale: string;
  portfolioRankings: string;
  contactDeveloper: string;
  noPlayersYet: string;
  passwordsNoMatch: string;
  registrationFailed: string;
  somethingWrong: string;
  quickPlayFailed: string;

  // Navbar
  signOut: string;
  myProfile: string;
  settings: string;

  // Global info bar
  totalPlayers: string;
  totalEconomy: string;

  // Leaderboard / Dashboard
  myProfileSection: string;
  playerValue: string;
  credits: string;
  portfolioValue: string;
  selfInflate: string;
  inflating: string;
  browsePlayers: string;
  playersYouOwn: string;
  yourOwners: string;
  search: string;
  searchPlayers: string;
  sortBy: string;
  lastOnline: string;
  value: string;
  newest: string;
  name: string;
  hasOwner: string;
  noPlayersFound: string;
  previous: string;
  next: string;
  page: string;
  of: string;

  // Player profile
  joined: string;
  lastSeen: string;
  owners: string;
  owns: string;
  buy: string;
  buying: string;
  sellOut: string;
  sellingOut: string;
  partner: string;
  partnering: string;
  unpartner: string;
  unpartnering: string;
  discard: string;
  discarding: string;
  sendCredits: string;
  sending: string;
  chat: string;
  directMessage: string;
  loading: string;
  playerNotFound: string;
  inactiveWarning: string;
  estimatedDeletion: string;

  // Sell out dialog
  sellOutConfirmTitle: string;
  sellOutConfirmDesc: string;
  sellOutConfirmButton: string;
  cancel: string;

  // Discard dialog
  discardConfirmTitle: string;
  discardConfirmDesc: string;
  discardConfirmButton: string;

  // Discard all dialog
  discardAll: string;
  discardingAll: string;
  discardAllConfirmTitle: string;
  discardAllConfirmDesc: string;
  discardAllConfirmButton: string;

  // Settings
  settingsTitle: string;
  changePassword: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  updatePassword: string;
  updatingPassword: string;
  uploadAvatar: string;

  // Transactions
  transactionHistory: string;
  noTransactions: string;
  bought: string;
  sold: string;
  from: string;
  to: string;


  // New player guide
  guideTitle: string;
  guideStep1Title: string;
  guideStep1Desc: string;
  guideStep2Title: string;
  guideStep2Desc: string;
  guideStep3Title: string;
  guideStep3Desc: string;
  guideStep4Title: string;
  guideStep4Desc: string;
  guideStep5Title: string;
  guideStep5Desc: string;
  guideStep6Title: string;
  guideStep6Desc: string;

  // Auth pages
  loginTitle: string;
  loginSubtitle: string;
  dontHaveAccount: string;
  register: string;
  registerTitle: string;
  registerSubtitle: string;

  // Misc
  perMin: string;
  online: string;
  offline: string;
  verified: string;
};

const en: TranslationKeys = {
  // Landing page
  joinTitle: "Join n38worth",
  joinSubtitle: "Create your account and start trading players",
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
  quickPlayHint: "Jump in instantly with a random player — no sign-up needed",
  alreadyHaveAccount: "Already have an account?",
  signIn: "Sign in",
  tributeNote: "This game is a tribute to",
  friendsForSale: "Friends for Sale",
  portfolioRankings: "Portfolio Rankings",
  contactDeveloper: "Contact Developer",
  noPlayersYet: "No players with avatars yet.",
  passwordsNoMatch: "Passwords do not match",
  registrationFailed: "Registration failed",
  somethingWrong: "Something went wrong. Please try again.",
  quickPlayFailed: "Quick play failed",

  // Navbar
  signOut: "Sign Out",
  myProfile: "My Profile",
  settings: "Settings",

  // Global info bar
  totalPlayers: "Players",
  totalEconomy: "Economy",

  // Leaderboard / Dashboard
  myProfileSection: "My Profile",
  playerValue: "Player Value",
  credits: "Credits",
  portfolioValue: "Portfolio Value",
  selfInflate: "Self Inflate",
  inflating: "Inflating...",
  browsePlayers: "Browse Players",
  playersYouOwn: "Players You Own",
  yourOwners: "Your Owners",
  search: "Search",
  searchPlayers: "Search players...",
  sortBy: "Sort by",
  lastOnline: "Last Online",
  value: "Value",
  newest: "Newest",
  name: "Name",
  hasOwner: "Has Owner",
  noPlayersFound: "No players found.",
  previous: "Previous",
  next: "Next",
  page: "Page",
  of: "of",

  // Player profile
  joined: "Joined",
  lastSeen: "Last seen",
  owners: "Owners",
  owns: "Owns",
  buy: "Buy",
  buying: "Buying...",
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
  playerNotFound: "Player not found",
  inactiveWarning: "This account is inactive and may be deleted soon.",
  estimatedDeletion: "Estimated deletion",

  // Sell out dialog
  sellOutConfirmTitle: "Sell Out?",
  sellOutConfirmDesc: "Are you sure you want to sell yourself out from this owner? You will receive credits based on your current value.",
  sellOutConfirmButton: "Yes, Sell Out",
  cancel: "Cancel",

  // Discard dialog
  discardConfirmTitle: "Discard Player?",
  discardConfirmDesc: "Are you sure you want to discard this player? You will lose ownership.",
  discardConfirmButton: "Yes, Discard",

  // Discard all dialog
  discardAll: "Discard All",
  discardingAll: "Discarding All...",
  discardAllConfirmTitle: "Discard All Players?",
  discardAllConfirmDesc: "Are you sure you want to discard all {count} owned players? You will receive approximately {value}¢ and all their values will reset. Players with active sell blocks will be skipped.",
  discardAllConfirmButton: "Yes, Discard All",

  // Settings
  settingsTitle: "Settings",
  changePassword: "Change Password",
  currentPassword: "Current Password",
  newPassword: "New Password",
  confirmNewPassword: "Confirm New Password",
  updatePassword: "Update Password",
  updatingPassword: "Updating...",
  uploadAvatar: "Upload Avatar",

  // Transactions
  transactionHistory: "Transaction History",
  noTransactions: "No transactions yet.",
  bought: "bought",
  sold: "sold",
  from: "from",
  to: "to",


  // New player guide
  guideTitle: "Welcome to n38worth! Here's how to get started:",
  guideStep1Title: "Start with Credits",
  guideStep1Desc: "You begin with 100.00¢ to buy players.",
  guideStep2Title: "Buy Players",
  guideStep2Desc: "Purchase others to add them to your portfolio.",
  guideStep3Title: "Earn Revenue",
  guideStep3Desc: "When someone buys a player you own, you get a share of the purchase price!",
  guideStep4Title: "Get Purchased",
  guideStep4Desc: "When someone buys you, your value increases!",
  guideStep5Title: "Grow Your Value",
  guideStep5Desc: "Climb the leaderboard by growing your portfolio.",
  guideStep6Title: "Compete",
  guideStep6Desc: "Race to the top of the leaderboard and earn prizes!",

  // Auth pages
  loginTitle: "Welcome Back",
  loginSubtitle: "Sign in to your account",
  dontHaveAccount: "Don't have an account?",
  register: "Register",
  registerTitle: "Create Account",
  registerSubtitle: "Join the game and start trading",

  // Misc
  perMin: "/min",
  online: "Online",
  offline: "Offline",
  verified: "Verified",
};

export const translations: Record<string, TranslationKeys> = { en };