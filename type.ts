export interface SafetyAdjustment {
  original: string;
  replacement: string;
  reason: string;
}

export type PromptRisk =
  | "MINOR_REFERENCE"
  | "PHOTOREALISTIC_PERSON"
  | "EMOTIONAL_VULNERABILITY"
  | "NONE";
