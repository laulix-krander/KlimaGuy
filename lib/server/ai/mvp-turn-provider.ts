import type { MvpAiTurnInput } from "@/lib/domain/mvp-ai-turn";

/** Provider output is deliberately unknown until the canonical Step-5 schema validates it. */
export interface MvpAiTurnProvider {
  generateTurn(input: MvpAiTurnInput): Promise<unknown>;
}
