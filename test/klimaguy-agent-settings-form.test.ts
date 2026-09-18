import { describe, expect, it } from "vitest";
import { parseKlimaGuySettingsFormData } from "../lib/actions/klimaguy-agent-settings-form";

function validSettingsFormData(): FormData {
  const formData = new FormData();
  formData.set("communication_formality", "formal");
  formData.set("tone", "friendly");
  formData.set("response_length", "balanced");
  formData.set("emoji_usage", "none");
  formData.set("acknowledge_answers", "on");
  formData.set("question_strategy", "group_compatible");
  formData.set("greeting_style", "warm");
  formData.set("closing_style", "warm");
  formData.set("customer_name_timing", "early");
  formData.set("use_customer_name", "true");
  formData.set("photo_request_strategy", "grouped");
  formData.set("unknown_answer_behavior", "mark_unknown_and_continue");
  formData.set("site_visit_policy", "recommend_on_required_site_check");
  formData.set("expected_revision", "3");
  return formData;
}

describe("KlimaGuy settings form boundary", () => {
  it("parses changed settings and checkboxes while ignoring Next.js metadata and other fields", () => {
    const formData = validSettingsFormData();
    formData.set("$ACTION_ID_example", "internal");
    formData.set("untrusted_browser_field", "not a setting");

    const result = parseKlimaGuySettingsFormData(formData);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid settings form data");
    expect(result.data).toMatchObject({
      communication_formality: "formal",
      response_length: "balanced",
      acknowledge_answers: true,
      ask_customer_name: false,
      use_customer_name: true,
      expected_revision: 3,
    });
    expect(result.data).not.toHaveProperty("$ACTION_ID_example");
    expect(result.data).not.toHaveProperty("untrusted_browser_field");
  });

  it("rejects an invalid known setting", () => {
    const formData = validSettingsFormData();
    formData.set("tone", "salesy");

    expect(parseKlimaGuySettingsFormData(formData).success).toBe(false);
  });

  it("rejects an invalid expected revision", () => {
    const formData = validSettingsFormData();
    formData.set("expected_revision", "not-a-revision");

    expect(parseKlimaGuySettingsFormData(formData).success).toBe(false);

    formData.delete("expected_revision");
    expect(parseKlimaGuySettingsFormData(formData).success).toBe(false);
  });
});
