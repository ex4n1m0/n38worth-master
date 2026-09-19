export interface OnboardingState {
  avatarCompleted: boolean;
  marketUnlocked: boolean;
  starterNpcIds: number[];
  starterNpcOwnedCount: number;
  onboardingComplete: boolean;
  profession?: string | null;
  professionSelected: boolean;
  /** Tutorial overlay state: 0 = show on next login, 1 = finished, 2 = cancelled. */
  tutorialCompleted: number;
}