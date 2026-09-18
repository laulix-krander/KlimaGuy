import { z } from "zod";
import { klimaguyAgentSettingsSchema } from "@/lib/domain/klimaguy-agent-settings";

const checkbox = z.enum(["on", "true"]).nullish().transform(Boolean);

const formSchema = klimaguyAgentSettingsSchema.extend({
  expected_revision: z.coerce.number().int().nonnegative(),
  acknowledge_answers: checkbox,
  ask_customer_name: checkbox,
  use_customer_name: checkbox,
});

export function parseKlimaGuySettingsFormData(formData: FormData) {
  return formSchema.safeParse({
    communication_formality: formData.get("communication_formality"),
    tone: formData.get("tone"),
    response_length: formData.get("response_length"),
    emoji_usage: formData.get("emoji_usage"),
    acknowledge_answers: formData.get("acknowledge_answers"),
    question_strategy: formData.get("question_strategy"),
    greeting_style: formData.get("greeting_style"),
    closing_style: formData.get("closing_style"),
    ask_customer_name: formData.get("ask_customer_name"),
    customer_name_timing: formData.get("customer_name_timing"),
    use_customer_name: formData.get("use_customer_name"),
    photo_request_strategy: formData.get("photo_request_strategy"),
    unknown_answer_behavior: formData.get("unknown_answer_behavior"),
    site_visit_policy: formData.get("site_visit_policy"),
    expected_revision: formData.get("expected_revision") ?? undefined,
  });
}
