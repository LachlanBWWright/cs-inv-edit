export type RevealAnimationMode = "none" | "countdown" | "slot-machine";

export type TradeUpAnimationMode =
  | RevealAnimationMode
  | "contract-none"
  | "contract-countdown"
  | "contract-slot-machine";

export interface AnimationSettings {
  container: RevealAnimationMode;
  tradeUp: TradeUpAnimationMode;
  armory: RevealAnimationMode;
  terminal: RevealAnimationMode;
}
