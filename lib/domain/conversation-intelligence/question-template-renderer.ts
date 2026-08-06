import { selectedNextActionSchema } from "./question-planner-schemas";
import { QUESTION_TEMPLATE_REGISTRY, getQuestionTemplate, validateQuestionTemplateRegistry } from "./question-template-registry";
import { renderParametersSchema, renderedCustomerInteractionSchema } from "./question-template-schemas";
import { QUESTION_TEMPLATE_LOCALES, type QuestionTemplate, type RenderParameters, type RenderQuestionTemplateInput, type RenderQuestionTemplateResult, type TemplateRenderErrorCode } from "./question-template-types";

const failure = (code: TemplateRenderErrorCode): RenderQuestionTemplateResult => ({ success: false, code });
const list = (heading: string, value: string | readonly string[]): string => `${heading}: ${Array.isArray(value) ? value.join("; ") : value}`;
function applyControlledParameters(template: QuestionTemplate, parameters: RenderParameters): Pick<QuestionTemplate, "primary_text" | "supporting_text" | "help_text" | "accessibility_text"> {
  if (template.template_key === "confirm_room_area_assumption") return { primary_text: `Falls du die genaue Raumgröße nicht kennst, können wir vorläufig mit etwa ${parameters.approximate_example as string} weiterarbeiten. Passt das ungefähr?`, supporting_text: template.supporting_text };
  if (template.template_key === "present_preliminary_assessment") return { primary_text: template.primary_text, supporting_text: [list("Einordnung", parameters.assessment_level_label!), list("Bereits bekannt", parameters.known_items!), list("Vorläufige Annahmen", parameters.assumption_items!), list("Noch offen", parameters.open_items!), list("Nächster Schritt", parameters.next_step_label!)].join("\n") };
  return { primary_text: template.primary_text, supporting_text: template.supporting_text, help_text: template.help_text, accessibility_text: template.accessibility_text };
}
export function renderQuestionTemplate(input: RenderQuestionTemplateInput): RenderQuestionTemplateResult {
  const registry = input.registry ?? QUESTION_TEMPLATE_REGISTRY;
  if (!validateQuestionTemplateRegistry(registry)) return failure("template_registry_invalid");
  if (!(QUESTION_TEMPLATE_LOCALES as readonly string[]).includes(input.locale)) return failure("locale_not_supported");
  const action = selectedNextActionSchema.safeParse(input.selected_action);
  if (!action.success) return failure("render_failed");
  if (!action.data.template_key) return failure("template_not_found");
  if (action.data.template_version !== undefined && action.data.template_version !== input.template_version) return failure("stale_template_binding");
  const keyExists = registry.some((item) => item.template_key === action.data.template_key && item.locale === input.locale);
  if (!keyExists) return failure("template_not_found");
  const template = getQuestionTemplate(registry, action.data.template_key, "de", input.template_version);
  if (!template) return failure("template_version_not_found");
  if (template.supported_action_type !== action.data.action_type) return failure("unsupported_action_type");
  if (template.information_key !== action.data.information_key) return failure("information_key_mismatch");
  if (template.supported_answer_type && template.supported_answer_type !== action.data.answer_contract?.answer_type) return failure("unsupported_answer_type");
  if (Boolean(template.answer_contract) !== Boolean(action.data.answer_contract)) return failure("answer_contract_mismatch");
  const suppliedKeys = Object.keys(input.render_parameters);
  if (suppliedKeys.some((key) => !template.controlled_parameter_keys.includes(key as never))) return failure("invalid_render_parameter");
  if (template.controlled_parameter_keys.some((key) => input.render_parameters[key] === undefined)) return failure("missing_render_parameter");
  const parsedParameters = renderParametersSchema.safeParse(input.render_parameters);
  if (!parsedParameters.success) return failure("invalid_render_parameter");
  const renderedText = applyControlledParameters(template, parsedParameters.data);
  const interaction = { project_id: action.data.project_id, conversation_id: action.data.conversation_id, decision_id: action.data.decision_id, template_key: template.template_key, template_version: template.template_version, locale: template.locale, message_kind: template.message_kind, ...renderedText, examples: [...template.examples], answer_contract: template.answer_contract, answer_options: template.answer_contract ? [...template.answer_contract.options] : [], customer_visible: template.customer_visible };
  const parsedInteraction = renderedCustomerInteractionSchema.safeParse(interaction);
  return parsedInteraction.success ? { success: true, interaction: parsedInteraction.data } : failure("render_failed");
}
