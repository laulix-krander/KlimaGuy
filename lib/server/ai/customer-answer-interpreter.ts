import "server-only";

import { getAnswerInterpretationRule } from "@/lib/domain/conversation-intelligence/answer-interpretation-registry";
import type { NormalizedCustomerAnswer } from "@/lib/domain/conversation-intelligence/answer-normalization-types";
import type { CustomerMessageCycleAuthority } from "@/lib/actions/persistent-conversation-cycle-service";
import type { StructuredInferenceProvider } from "./contracts";
import { interpretCustomerAnswer, type InterpretCustomerAnswerResult } from "./operations/customer-answer-classification/operation";

export type ProductiveCustomerAnswerInterpreter = (input: Readonly<{
  authority: CustomerMessageCycleAuthority;
  normalizedAnswer: NormalizedCustomerAnswer;
  attempt: 1 | 2 | 3;
}>) => Promise<InterpretCustomerAnswerResult>;

/** Builds only the narrow, bound and server-authorized classification input. */
export function createCustomerAnswerInterpreter(provider: StructuredInferenceProvider): ProductiveCustomerAnswerInterpreter {
  return ({ authority, normalizedAnswer, attempt }) => {
    const action = authority.cycle_context.interpretation_inputs.selected_action;
    const rule = getAnswerInterpretationRule(action.information_key);
    const text = normalizedAnswer.outcome === "answered" && normalizedAnswer.value.kind === "text"
      ? normalizedAnswer.value.value
      : "";
    return interpretCustomerAnswer({
      operation:"customer_answer.canonical_classification", operationVersion:1, schemaVersion:1, locale:"de",
      correlation:{ correlationId:authority.cycle_context.correlation_id, conversationId:authority.conversation_id,
        answerId:authority.message_id, decisionId:action.decision_id, attempt },
      question:{ informationKey:action.information_key, semanticMode:rule?.semantic_mode ?? "technical_property",
        templateKey:authority.rendered_interaction.template_key, templateVersion:authority.rendered_interaction.template_version },
      answer:{ text },
      allowedValues:Object.values(rule?.canonical_values ?? {}).filter((value, index, values) => values.indexOf(value) === index)
        .map(key => ({ key, label:key })),
    }, provider);
  };
}

export function isCustomerAnswerAiEligible(authority: CustomerMessageCycleAuthority, answer: NormalizedCustomerAnswer): boolean {
  const action = authority.cycle_context.interpretation_inputs.selected_action;
  const rule = getAnswerInterpretationRule(action.information_key);
  if (answer.outcome !== "answered" || answer.value.kind !== "text" || !rule?.canonical_values || rule.status !== "active" || rule.supported_normalized_kind !== "text") return false;
  const normalized = answer.value.value.trim().toLocaleLowerCase("de-DE").replace(/[.!?]+$/u, "").trim();
  return !rule.canonical_values[normalized];
}
