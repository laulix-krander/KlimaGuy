import { describe, expect, it, vi } from "vitest";
import { runMvpConversationTurn, type MvpTurnStore } from "../lib/server/conversation/mvp-conversation-turn";
import type { MvpAiTurnProvider } from "../lib/server/ai/mvp-turn-provider";
import type { MvpProjectFact } from "../lib/domain/mvp-project-facts";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const context = {
  status: "acquired", turn_id: id(9),
  turn: { inbound_message_id: id(1), conversation_id: id(2), expected_conversation_revision: 2, binding_id: id(3), binding_revision: 1, project_id: id(4) },
  project: { title: "Neue Klimaanfrage" }, customer: { name_known: false, first_name: null, last_name: null }, inbound: { message_id: id(1), text: "28 qm Wohnzimmer" },
  transcript: [
    { message_id: id(5), sequence: 1, direction: "outbound", text: "Wie kann ich helfen?" },
    { message_id: id(1), sequence: 2, direction: "inbound", text: "28 qm Wohnzimmer" },
  ], ready_media: [],
} as const;
const valid = { reply_text: "Danke! Wo kann das Außengerät stehen?", facts_patch: [{ key: "room_area_sqm", value: 28 }], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [], learning_candidates: [] } as const;

function harness(output: unknown = valid) {
  let facts: MvpProjectFact[] = [{ key: "room_type", value: "living_room" }];
  const acquire = vi.fn().mockResolvedValue(context); const commit = vi.fn(async (_turn, result): Promise<unknown> => {
    facts = [...facts.filter((old) => !result.facts_patch.some((next: MvpProjectFact) => next.key === old.key)), ...result.facts_patch];
    return { status: "completed", outbound_message_id: id(10) };
  });
  const fail = vi.fn().mockResolvedValue(undefined);
  const store: MvpTurnStore = { acquire, commit, fail, loadMedia: vi.fn(), revalidate: vi.fn().mockResolvedValue(true), rpc: vi.fn(async (name) => ({ data: name === "get_mvp_project_facts" ? facts : null, error: null })) };
  const provider: MvpAiTurnProvider = { generateTurn: vi.fn().mockResolvedValue(output) };
  return { store, provider, acquire, commit, fail, facts: () => facts };
}

describe("MVP conversation turn", () => {
  it("completes an omitted current-image classification conservatively before commit", async () => {
    const h = harness();
    h.acquire.mockResolvedValue({ ...context, inbound: { message_id: id(1), text: null }, ready_media: [{
      media_id: id(20), category: "other", mime_type: "image/jpeg", caption: null,
      storage_bucket: "project-media", storage_path: `projects/${id(4)}/image.jpg`, file_size_bytes: 3,
    }] });
    vi.mocked(h.store.loadMedia).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));

    const result = await runMvpConversationTurn(id(2), id(1), h);

    const completed = { ...valid, media_classifications: [{ media_id: id(20), category: "other", observation: null }] };
    expect(h.commit).toHaveBeenCalledWith(id(9), completed);
    expect(result).toMatchObject({ status: "completed", turn: completed });
  });

  it("rejects an unrelated media id before commit and persists no classification", async () => {
    const h = harness({ ...valid, media_classifications: [{ media_id: id(21), category: "room_overview", observation: null }] });
    h.acquire.mockResolvedValue({ ...context, inbound: { message_id: id(1), text: null }, ready_media: [{
      media_id: id(20), category: "other", mime_type: "image/jpeg", caption: null,
      storage_bucket: "project-media", storage_path: `projects/${id(4)}/image.jpg`, file_size_bytes: 3,
    }] });
    vi.mocked(h.store.loadMedia).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));

    await expect(runMvpConversationTurn(id(2), id(1), h)).rejects.toThrow("mvp_turn_invalid_provider_output");
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.fail).toHaveBeenCalledWith(id(9), "invalid_provider_output");
  });

  it("loads actual private image bytes and supplies them only to the acquired turn", async () => {
    const h = harness();
    h.acquire.mockResolvedValue({ ...context, inbound: { message_id: id(1), text: null }, ready_media: [{
      media_id: id(20), category: "room_overview", mime_type: "image/jpeg", caption: null,
      storage_bucket: "project-media", storage_path: `projects/${id(4)}/image.jpg`, file_size_bytes: 3,
    }] });
    vi.mocked(h.store.loadMedia).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));
    await runMvpConversationTurn(id(2), id(1), h);
    expect(h.store.loadMedia).toHaveBeenCalledWith("project-media", `projects/${id(4)}/image.jpg`);
    expect(h.provider.generateTurn).toHaveBeenCalledWith(expect.objectContaining({ ready_media: [expect.objectContaining({
      media_id: id(20), image_data: "data:image/jpeg;base64,/9j/",
    })] }));
  });

  it("stops before Vision inference when lifecycle revalidation fails", async () => {
    const h = harness(); vi.mocked(h.store.revalidate).mockResolvedValue(false);
    await expect(runMvpConversationTurn(id(2), id(1), h)).rejects.toThrow("mvp_turn_stale");
    expect(h.provider.generateTurn).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
  });

  it("loads canonical facts and only the acquired current-Conversation transcript", async () => {
    const h = harness(); await runMvpConversationTurn(id(2), id(1), h);
    expect(h.provider.generateTurn).toHaveBeenCalledOnce();
    expect(h.provider.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      persisted_facts: [{ key: "room_type", value: "living_room" }], inbound: context.inbound, transcript: context.transcript,
    }));
    expect(JSON.stringify(vi.mocked(h.provider.generateTurn).mock.calls[0][0])).not.toContain("old closed");
    expect(vi.mocked(h.provider.generateTurn).mock.calls[0][0]).not.toHaveProperty("previous_response_id");
  });

  it("supplies deterministic production qualification gaps despite complete core photo coverage", async () => {
    const h = harness();
    const productionFacts: MvpProjectFact[] = [
      { key: "installation_address", value: "Glashütterweg 14" }, { key: "postal_code", value: "22889" }, { key: "city", value: "tangstedt" },
      { key: "floor_level", value: 1 }, { key: "requested_room_count", value: 1 }, { key: "room_type", value: "living_room" },
      { key: "indoor_unit_position", value: "Wand" }, { key: "outdoor_unit_position", value: "Terrasse" },
    ];
    vi.mocked(h.store.rpc).mockResolvedValue({ data: productionFacts, error: null });
    h.acquire.mockResolvedValue({ ...context, project_photo_coverage: [
      { category: "room_overview", count: 1 }, { category: "indoor_unit_location", count: 1 }, { category: "outdoor_unit_location", count: 1 },
    ] });
    await runMvpConversationTurn(id(2), id(1), h);
    expect(h.provider.generateTurn).toHaveBeenCalledWith(expect.objectContaining({ qualification_context: {
      collection_active: true,
      missing_facts: ["building_type", "room_area_sqm", "indoor_unit_count", "line_route", "estimated_line_length_m", "condensate_drainage", "electrical_supply", "installation_access"],
      missing_photos: ["pipe_route"], requires_site_check: false,
    } }));
  });

  it("keeps truthful gaps but disables collection after human handoff while classifying the final image", async () => {
    const mediaId = id(20);
    const output = {
      ...valid,
      reply_text: "Danke, das aktuelle Foto ist erfasst. Die offenen Punkte klärt unser Techniker.",
      facts_patch: [],
      qualification_status: "needs_human" as const,
      needs_human: true,
      human_reason: "requires_site_check" as const,
      media_classifications: [{ media_id: mediaId, category: "other" as const, observation: null }],
    };
    const h = harness(output);
    h.acquire.mockResolvedValue({
      ...context,
      project: { title: "Neue Klimaanfrage", status: "human_review", requires_human_review: true },
      inbound: { message_id: id(1), text: "Das ist alles was ich habe, mehr Fotos hab ich nicht" },
      ready_media: [{ media_id: mediaId, category: "other", mime_type: "image/jpeg", caption: "Das ist alles was ich habe, mehr Fotos hab ich nicht", storage_bucket: "project-media", storage_path: `projects/${id(4)}/final.jpg`, file_size_bytes: 3 }],
      project_photo_coverage: [{ category: "room_overview", count: 1 }, { category: "outdoor_unit_location", count: 1 }],
    });
    vi.mocked(h.store.rpc).mockResolvedValue({ data: [
      { key: "room_type", value: "living_room" },
      { key: "electrical_supply", value: "available" },
      { key: "condensate_drainage", value: "unknown" },
    ], error: null });
    vi.mocked(h.store.loadMedia).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));

    await expect(runMvpConversationTurn(id(2), id(1), h)).resolves.toMatchObject({ status: "completed", turn: output });
    const providerInput = vi.mocked(h.provider.generateTurn).mock.calls[0][0];
    expect(providerInput.qualification_context.collection_active).toBe(false);
    expect(providerInput.qualification_context.missing_facts).toEqual(expect.arrayContaining(["line_route", "estimated_line_length_m"]));
    expect(providerInput.qualification_context.missing_photos).toEqual(expect.arrayContaining(["indoor_unit_location", "pipe_route", "electrical_connection", "condensate_route"]));
    expect(output.reply_text).not.toMatch(/Innen|Leitungsweg|Elektroanschluss|Kondensat.*Foto/iu);
    expect(output.facts_patch).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: "line_route" }), expect.objectContaining({ key: "estimated_line_length_m" })]));
    expect(h.commit).toHaveBeenCalledWith(id(9), output);
  });

  it("accepts voluntary facts without restarting collection for a human-review project", async () => {
    const output = { ...valid, reply_text: "Danke, ich habe den Hinweis für den Techniker ergänzt.", facts_patch: [{ key: "electrical_supply", value: "available" }] as const, qualification_status: "needs_human" as const, needs_human: true, human_reason: "requires_site_check" as const };
    const h = harness(output);
    h.acquire.mockResolvedValue({ ...context, project: { title: "Neue Klimaanfrage", status: "human_review", requires_human_review: true }, inbound: { message_id: id(1), text: "Übrigens, der Stromanschluss ist direkt daneben." } });

    await runMvpConversationTurn(id(2), id(1), h);

    expect(vi.mocked(h.provider.generateTurn).mock.calls[0][0].qualification_context.collection_active).toBe(false);
    expect(h.commit).toHaveBeenCalledWith(id(9), output);
    expect(output.reply_text).not.toMatch(/noch|fehlt|Foto/iu);
  });

  it("validates, persists the patch, and returns the canonical outbound reply", async () => {
    const h = harness(); const result = await runMvpConversationTurn(id(2), id(1), h);
    expect(result).toEqual({ status: "completed", outbound_message_id: id(10), turn: valid });
    expect(h.commit).toHaveBeenCalledWith(id(9), valid);
    expect(h.facts()).toContainEqual({ key: "room_area_sqm", value: 28 });
    await runMvpConversationTurn(id(2), id(1), h);
    expect(h.provider.generateTurn).toHaveBeenLastCalledWith(expect.objectContaining({ persisted_facts: expect.arrayContaining([{ key: "room_area_sqm", value: 28 }]) }));
  });

  it("accepts both fresh Step-11 completion metadata and minimal idempotent replay", async () => {
    const fresh = harness();
    fresh.commit.mockResolvedValue({
      status: "completed", outbound_message_id: id(10), qualification_status: "in_progress",
      handoff: "none", missing_facts: ["outdoor_unit_position"],
    });
    await expect(runMvpConversationTurn(id(2), id(1), fresh)).resolves.toMatchObject({
      status: "completed", outbound_message_id: id(10),
    });

    const replay = harness();
    replay.commit.mockResolvedValue({ status: "completed", outbound_message_id: id(10) });
    await expect(runMvpConversationTurn(id(2), id(1), replay)).resolves.toMatchObject({
      status: "completed", outbound_message_id: id(10),
    });
  });

  it.each([
    { status: "completed", outbound_message_id: id(10), qualification_status: "invented", handoff: "none", missing_facts: [] },
    { status: "completed", outbound_message_id: id(10), qualification_status: "in_progress", handoff: "automatic_offer", missing_facts: [] },
    { status: "completed", outbound_message_id: id(10), qualification_status: "in_progress", handoff: "none", missing_facts: ["price"] },
    { status: "completed", outbound_message_id: id(10), qualification_status: "in_progress", handoff: "none" },
  ])("rejects malformed extended Step-11 completion responses", async (response) => {
    const h = harness(); h.commit.mockResolvedValue(response);
    await expect(runMvpConversationTurn(id(2), id(1), h)).rejects.toThrow("mvp_turn_commit_failed");
    expect(h.fail).toHaveBeenCalledWith(id(9), "commit_failed");
  });

  it.each([
    [{ ...valid, surprise: true }],
    [{ ...valid, facts_patch: [{ key: "price", value: 99 }] }],
    [{ ...valid, qualification_status: "needs_human", needs_human: true, human_reason: null }],
  ])("rejects malformed provider output without facts or reply side effects", async (output) => {
    const h = harness(output); await expect(runMvpConversationTurn(id(2), id(1), h)).rejects.toThrow("mvp_turn_invalid_provider_output");
    expect(h.commit).not.toHaveBeenCalled(); expect(h.fail).toHaveBeenCalledWith(id(9), "invalid_provider_output");
  });

  it("persists nothing when the provider fails", async () => {
    const h = harness(); vi.mocked(h.provider.generateTurn).mockRejectedValue(new Error("offline"));
    await expect(runMvpConversationTurn(id(2), id(1), h)).rejects.toThrow("mvp_turn_provider_failed");
    expect(h.commit).not.toHaveBeenCalled(); expect(h.fail).toHaveBeenCalledWith(id(9), "provider_failure");
  });

  it("keeps duplicate discriminants as an intentional fail-closed canonical boundary", async () => {
    const h = harness({ ...valid, facts_patch: [{ key: "floor_level", value: 1 }, { key: "floor_level", value: 2 }] });
    await expect(runMvpConversationTurn(id(2), id(1), h)).rejects.toThrow("mvp_turn_invalid_provider_output");
    expect(h.fail).toHaveBeenCalledWith(id(9), "invalid_provider_output");
    expect(h.fail).not.toHaveBeenCalledWith(id(9), "provider_failure");
  });

  it("does not invoke a provider or create a reply for duplicate inbound", async () => {
    const h = harness(); h.acquire.mockResolvedValue({ status: "completed", turn_id: id(9), outbound_message_id: id(10) });
    await expect(runMvpConversationTurn(id(2), id(1), h)).resolves.toEqual({ status: "duplicate" });
    expect(h.provider.generateTurn).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
  });

  it.each([
    { ...valid, qualification_status: "needs_human", needs_human: true, human_reason: "requires_site_check", },
    { ...valid, qualification_status: "ready_for_offer", },
  ])("keeps qualification metadata in-contract without pricing or approval side effects", async (output) => {
    const h = harness(output); await runMvpConversationTurn(id(2), id(1), h);
    expect(h.commit).toHaveBeenCalledWith(id(9), output);
    expect(h.store).not.toHaveProperty("createOffer");
  });

  it("loads approved knowledge once and records generalized learning only after commit", async () => {
    const candidate = { category: "human_handoff" as const, title: "Fachplanung übergeben", proposed_guidance: "Professionelle Leitungsplanung an die technische Prüfung übergeben.", rationale: "Kunden können diese professionelle Planung nicht zuverlässig beurteilen." };
    const h = harness({ ...valid, learning_candidates: [candidate] });
    const loadKnowledge = vi.fn().mockResolvedValue([{ category: "photo_guidance", title: "Keine Wiederholung", guidance: "Nicht erneut nach ausdrücklich nicht verfügbaren Fotos fragen." }]);
    const recordLearningCandidates = vi.fn().mockImplementation(async () => { expect(h.commit).toHaveBeenCalled(); });
    await runMvpConversationTurn(id(2), id(1), { ...h, loadKnowledge, recordLearningCandidates });
    expect(loadKnowledge).toHaveBeenCalledTimes(1);
    expect(h.provider.generateTurn).toHaveBeenCalledWith(expect.objectContaining({ knowledge_context: expect.any(Array) }));
    expect(recordLearningCandidates).toHaveBeenCalledWith(id(9), [candidate]);
  });

  it("keeps a committed customer reply successful when learning persistence fails", async () => {
    const candidate = { category: "human_handoff" as const, title: "Fachplanung übergeben", proposed_guidance: "Professionelle Leitungsplanung an die technische Prüfung übergeben.", rationale: "Kunden können diese professionelle Planung nicht zuverlässig beurteilen." };
    const h = harness({ ...valid, learning_candidates: [candidate] });
    const result = await runMvpConversationTurn(id(2), id(1), { ...h, recordLearningCandidates: vi.fn().mockRejectedValue(new Error("down")) });
    expect(result.status).toBe("completed"); expect(h.fail).not.toHaveBeenCalled();
  });

  it("drops customer-specific learning before persistence", async () => {
    const h = harness({ ...valid, learning_candidates: [{ category: "customer_communication", title: "Felix freundlich helfen", proposed_guidance: "Felix soll bei Fachfragen freundlich an einen Techniker übergeben werden.", rationale: "Felix kann die Planung nicht zuverlässig beurteilen." }] });
    h.acquire.mockResolvedValue({ ...context, customer: { name_known: true, first_name: "Felix", last_name: null } });
    const recordLearningCandidates = vi.fn(); await runMvpConversationTurn(id(2), id(1), { ...h, recordLearningCandidates });
    expect(recordLearningCandidates).not.toHaveBeenCalled(); expect(h.commit).toHaveBeenCalled();
  });
});
