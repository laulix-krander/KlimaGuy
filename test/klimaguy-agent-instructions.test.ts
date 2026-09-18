import { describe, expect, it } from "vitest";
import { DEFAULT_KLIMAGUY_AGENT_SETTINGS } from "../lib/domain/klimaguy-agent-settings";
import { buildOpenAiMvpTurnInstructions } from "../lib/server/ai/providers/openai/mvp-turn-instructions";

describe("KlimaGuy structured personality instruction composer", () => {
  it.each([
    ["communication_formality", "formal", "durchgehend Sie/Ihnen/Ihr"], ["communication_formality", "informal", "durchgehend du/dir/dein"],
    ["tone", "professional", "klar, ruhig, technisch glaubwürdig"], ["tone", "friendly", "freundlich, nahbar"], ["tone", "relaxed", "locker und gesprächig"],
    ["response_length", "short", "1–3 kurze Sätze"], ["response_length", "balanced", "keine Essays"],
    ["emoji_usage", "none", "keine Gesprächs-Emojis"], ["emoji_usage", "sparse", "gelegentlich ein hilfreiches Emoji"],
    ["question_strategy", "one_at_a_time", "genau einer Hauptinformation"], ["question_strategy", "group_compatible", "wenige einfache, kompatible Fragen"],
    ["greeting_style", "concise", "Begrüßung: kurz"], ["greeting_style", "warm", "Begrüßung: leicht persönlich"],
    ["closing_style", "concise", "Abschluss oder Übergabe: kurz"], ["closing_style", "warm", "Abschluss oder Übergabe: freundlich"],
    ["customer_name_timing", "early", "nahe am Gesprächsbeginn"], ["customer_name_timing", "after_context", "nützlichen ersten Projektkontext"],
    ["photo_request_strategy", "grouped", "gebündelt an"], ["photo_request_strategy", "sequential", "jeweils nur nach einem"],
    ["unknown_answer_behavior", "mark_unknown_and_continue", "sicher zum nächsten"], ["unknown_answer_behavior", "escalate_when_critical", "nicht jedes Nichtwissen eskalieren"],
    ["site_visit_policy", "recommend_on_required_site_check", "technische Prüfung vor Ort nötig sein kann"], ["site_visit_policy", "human_decides", "verspreche selbst keinen Termin"],
  ] as const)("maps %s=%s", (key, value, phrase) => expect(buildOpenAiMvpTurnInstructions({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, [key]: value })).toContain(phrase));

  it("maps boolean behavior", () => {
    expect(buildOpenAiMvpTurnInstructions({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, acknowledge_answers: false })).toContain("Vermeide Bestätigungsfüller");
    expect(buildOpenAiMvpTurnInstructions({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, ask_customer_name: false })).toContain("nicht proaktiv");
    expect(buildOpenAiMvpTurnInstructions({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, use_customer_name: false })).toContain("nicht mit seinem bekannten Namen");
  });
  it("keeps every hard boundary invariant across representative configurations", () => {
    for (const settings of [DEFAULT_KLIMAGUY_AGENT_SETTINGS, { ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, communication_formality: "formal" as const, tone: "professional" as const, photo_request_strategy: "sequential" as const }]) {
      const text = buildOpenAiMvpTurnInstructions(settings);
      for (const boundary of ["Nenne oder erfinde niemals Preise", "genehmige oder versende niemals ein Angebot", "Behaupte niemals eine physische Besichtigung", "keine technische Freigabe", "HAT DIESE HUMAN-REVIEW-REGEL VORRANG"]) expect(text).toContain(boundary);
    }
  });
  it("never lets customer language override formal consistency", () => {
    const formal = buildOpenAiMvpTurnInstructions({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, communication_formality: "formal" });
    expect(formal).toContain("Wechsle niemals wegen informeller Kundensprache zum Du");
    expect(buildOpenAiMvpTurnInstructions(DEFAULT_KLIMAGUY_AGENT_SETTINGS)).toContain("Wechsle im Gespräch niemals zum Sie");
  });
});
