"use client";

import React, { useMemo, useRef, useState } from "react";
import type { RawCustomerAnswer } from "@/lib/domain/conversation-intelligence";
import {
  createSimulatorStart,
  executeSimulatorAnswer,
  executeSimulatorContinuation,
  executeSimulatorEvidenceResponse,
  createEvidenceObservationState,
  EVIDENCE_OBSERVATION_DEFINITIONS,
  observationOptionsForTarget,
  proposeKnowledgeClaimFromObservation,
  recordEvidenceObservation,
  SIMULATOR_SCENARIOS,
  type SimulatorScenarioId,
  type EvidenceObservationType,
  type ObservationClaimMappingResult,
} from "@/lib/domain/conversation-intelligence";
import type { RenderedCustomerInteraction } from "@/lib/domain/conversation-intelligence/question-template-types";

export type SimulatorRun = NonNullable<ReturnType<typeof executeSimulatorAnswer>["result"]>;
type Message = {
  message_id: string;
  kind:
    | "system_question"
    | "tester_answer"
    | "evidence_request"
    | "evidence_response"
    | "intermediate"
    | "site_check"
    | "human_review";
  primary_text: string;
  supporting_text?: string;
  answer_options?: readonly string[];
  cycle_index: number;
};
const statusLabels: Record<string, string> = {
  confirmed: "Bestätigt",
  reported: "Kundenangabe",
  observed: "Beobachtet",
  estimated: "Geschätzt",
  assumed: "Annahme",
  unknown: "Unbekannt",
  requires_site_check: "Vor Ort prüfen",
  contradicted: "Widersprüchlich",
};
const eventLabels: Record<string, string> = {
  customer_answer_interpreted: "Antwort interpretiert",
  knowledge_claim_recorded: "Knowledge Claim gespeichert",
  knowledge_claim_superseded: "Knowledge Claim ersetzt",
  answer_unknown_recorded: "Unbekannt vermerkt",
  answer_skipped: "Übersprungen",
  assumption_confirmed: "Annahme bestätigt",
  assumption_rejected: "Annahme abgelehnt",
  assumption_deferred: "Annahme zurückgestellt",
  human_review_requested: "Human Review angefordert",
  conversation_cycle_completed: "Cycle abgeschlossen",
};
const propertyLabels: Record<string, string> = {
  room_area_sqm: "Raumgröße",
  indoor_unit_position_known: "Innenposition",
  outdoor_unit_position_known: "Außenposition",
  line_route_known: "Leitungsweg",
  condensate_route_known: "Kondensat",
  electrical_supply_known: "Elektroversorgung",
  accessibility_known: "Zugänglichkeit",
  desired_installation_scope: "Installationswunsch",
  room_type: "Raumtyp",
  building_type: "Gebäudetyp",
};
const collectionPathLabels: Record<string,string>={customer_question:"Kundenfrage",customer_clarification:"Kontrollierte Rückfrage",existing_evidence:"Vorhandene Evidence",future_photo_request:"Späteres Foto / zusätzliche Evidence",future_document_request:"Späteres Dokument",assumption:"Mögliche Annahme",site_check:"Vor-Ort-Prüfung",human_review:"Fachliche Prüfung",leave_open:"Offen lassen"};
const gainReasonLabels:Record<string,string>={new_information_expected:"Neue Information zu erwarten",alternate_question_strategy:"Alternativer Frageweg",dependency_context_changed:"Dependency-Kontext verändert",same_context_as_previous_attempt:"Kontext unverändert",customer_path_exhausted:"Kundenpfad ausgeschöpft",additional_evidence_required:"Zusätzliche Evidence erforderlich",retry_limit_reached:"Versuchslimit erreicht",future_photo_path:"Späterer Fotopfad",site_check_path:"Vor-Ort-Pfad",no_available_collection_path:"Aktuell kein Erhebungsweg"};
const box = "rounded-xl border bg-white p-4 shadow-sm";

export function ConversationSimulator() {
  const [scenario, setScenario] = useState<SimulatorScenarioId>(
    "empty_synthetic_project",
  );
  const [context, setContext] = useState(() =>
    createSimulatorStart("empty_synthetic_project"),
  );
  const [initial] = useState(() =>
    createSimulatorStart("empty_synthetic_project"),
  );
  const [runs, setRuns] = useState<SimulatorRun[]>([]);
  const [raws, setRaws] = useState<RawCustomerAnswer["raw_value"][]>([]);
  const [evidenceResponses,setEvidenceResponses]=useState<Array<{request_id:string;outcome:"provided"|"declined"|"skipped"}>>([]);
  const [observationState,setObservationState]=useState(()=>createEvidenceObservationState(context.project_id,context.conversation_id));
  const [selectedObservations,setSelectedObservations]=useState<readonly EvidenceObservationType[]>([]);
  const [mappingResult,setMappingResult]=useState<ObservationClaimMappingResult>();
  const [currentInteraction, setCurrentInteraction] =
    useState<RenderedCustomerInteraction | null>(
      () => context.interpretation_inputs.rendered_interaction,
    );
  const [messages, setMessages] = useState<Message[]>(() => [
    interactionMessage(context.interpretation_inputs.rendered_interaction, 0),
  ]);
  const [value, setValue] = useState("");
  const [debug, setDebug] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const lock = useRef(false);
  const continuationConsumed = useRef(false);
  const last = runs.at(-1);
  const interaction = currentInteraction;
  const reset = (id: SimulatorScenarioId = scenario) => {
    const start = createSimulatorStart(id);
    setContext(start);
    setCurrentInteraction(start.interpretation_inputs.rendered_interaction);
    setRuns([]);
    setRaws([]);
    setEvidenceResponses([]);
    setObservationState(createEvidenceObservationState(start.project_id,start.conversation_id));
    setSelectedObservations([]);
    setMappingResult(undefined);
    setMessages([
      interactionMessage(start.interpretation_inputs.rendered_interaction, 0),
    ]);
    setValue("");
    setError(undefined);
    setNotice("Szenario wurde zurückgesetzt.");
    continuationConsumed.current = false;
  };
  const choose = (id: SimulatorScenarioId) => {
    setScenario(id);
    reset(id);
  };
  const send = (rawValue: RawCustomerAnswer["raw_value"]) => {
    if (lock.current || !interaction) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const cycle = runs.length + 1;
      const execution = executeSimulatorAnswer(context, rawValue, cycle);
      if (!execution.normalized.success) {
        setError("Die synthetische Antwort ist für diese Frage ungültig.");
        return;
      }
      if (!execution.result) {
        setError("Der Conversation Cycle konnte nicht ausgeführt werden.");
        return;
      }
      setRaws((items) => [...items, rawValue]);
      setRuns((items) => [...items, execution.result!]);
      const answer: Message = {
        message_id: `answer-${cycle}`,
        kind: "tester_answer",
        primary_text:
          rawValue.kind === "text"
            ? rawValue.value
            : (interaction.answer_options.find(
                (option) => option.option_key === rawValue.option_key,
              )?.label ?? rawValue.option_key),
        cycle_index: cycle,
      };
      setCurrentInteraction(null);
      if (!execution.result.success) {
        const review = execution.result.requires_human_review;
        setMessages((items) => [
          ...items,
          answer,
          statusMessage(
            cycle,
            review ? "human_review" : "site_check",
            review
              ? "Fachliche Prüfung erforderlich"
              : "Fragensammlung beendet",
          ),
        ]);
        setError(
          review
            ? "Dieser Fall benötigt eine fachliche Prüfung."
            : "Der Conversation Cycle wurde kontrolliert beendet.",
        );
        return;
      }
      const cycleResult = execution.result;
      continuationConsumed.current = false;
      if (execution.next) setContext(execution.next);
      const nextInteraction = activeInteractionFor(cycleResult);
      setCurrentInteraction(nextInteraction);
      setMessages((items) => [
        ...items,
        answer,
        ...(nextInteraction
          ? [interactionMessage(nextInteraction, cycle)]
          : [cycleStatusMessage(cycleResult, cycle)]),
      ]);
      if (cycleResult.cycle_status === "human_review_required")
        setNotice("Dieser Fall benötigt eine fachliche Prüfung.");
      else if (!nextInteraction)
        setNotice(
            cycleResult.cycle_status === "intermediate_result_ready"
            ? "Zwischenstand erreicht"
            : "Für diesen Testlauf ist aktuell keine weitere Kundenfrage vorgesehen.",
        );
      setValue("");
    } finally {
      setPending(false);
      lock.current = false;
    }
  };
  const continueConversation = () => {
    if (lock.current || continuationConsumed.current || !last?.success || last.cycle_status !== "intermediate_result_ready") return;
    lock.current = true;
    continuationConsumed.current = true;
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const execution = executeSimulatorContinuation(context, last, runs.length + 101);
      if (!execution.result.success) {
        continuationConsumed.current = false;
        setError("Das Gespräch konnte nicht kontrolliert fortgesetzt werden.");
        return;
      }
      const cycle = runs.length + 1;
      if (execution.result.status === "human_review_required") {
        setMessages((items) => [...items, statusMessage(cycle, "human_review", "Fachliche Prüfung erforderlich")]);
        setNotice("Dieser Fall benötigt eine fachliche Prüfung.");
        return;
      }
      if (execution.result.status === "stopped") {
        setMessages((items) => [...items, statusMessage(cycle, "intermediate", "Zwischenstand erreicht")]);
        setNotice("Für diesen Testlauf ist aktuell keine weitere Kundenfrage vorgesehen.");
        return;
      }
      const nextInteraction = execution.result.rendered_interaction;
      if (!execution.next || !nextInteraction) {
        continuationConsumed.current = false;
        setError("Das Gespräch konnte nicht kontrolliert fortgesetzt werden.");
        return;
      }
      setContext(execution.next);
      setCurrentInteraction(nextInteraction);
      setMessages((items) => [
        ...items,
        statusMessage(cycle, "intermediate", "Gespräch wird fortgesetzt."),
        interactionMessage(nextInteraction, cycle),
      ]);
      setNotice(undefined);
    } finally {
      setPending(false);
      lock.current = false;
    }
  };
  const respondToEvidence=(outcome:"provided"|"declined"|"skipped")=>{
    if(!last?.success||last.cycle_status!=="evidence_request_selected"||!last.selected_evidence_request)return;
    const request=last.selected_evidence_request;const cycle=runs.length+1;
    const execution=executeSimulatorEvidenceResponse(context,last,{kind:"evidence_response",request_id:request.request_id,outcome},cycle);
    if(!execution.next){setError("Die Fotoantwort konnte nicht kontrolliert verarbeitet werden.");return;}
    setEvidenceResponses(items=>[...items,{request_id:request.request_id,outcome}]);setRuns(items=>[...items,execution.result]);setContext(execution.next);
    const label=outcome==="provided"?"Foto vorhanden – noch nicht ausgewertet":outcome==="declined"?"Kann ich nicht liefern":"Übersprungen";
    setMessages(items=>[...items,{message_id:`evidence-response-${cycle}`,kind:"evidence_response",primary_text:label,cycle_index:cycle}]);setNotice("Evidence Response verarbeitet; offene Fachinformation bleibt unverändert.");
  };
  const saveObservations=()=>{
    const available=last?.success?last.evidence_availability.find(item=>item.status==="available_unanalysed"&&item.evidence_id&&item.request_id):undefined;
    if(!available||!selectedObservations.length)return;
    let next=observationState;
    for(const [index,type] of selectedObservations.entries()){
      const bad=type.startsWith("image_");
      const quality=type==="image_insufficient"?"insufficient":type==="image_obstructed"?"obstructed":type==="image_wrong_area"?"wrong_target":"sufficient_for_observation";
      const status=type==="image_insufficient"?"insufficient":type==="image_obstructed"?"requires_review":type==="image_wrong_area"?"rejected":"observed";
      const reason=type==="image_insufficient"?"insufficient_view":type==="image_obstructed"?"view_obstructed":type==="image_wrong_area"?"wrong_target_shown":"visible_feature_recorded";
      const suffix=String(next.revision+index+1).padStart(12,"0");
      const result=recordEvidenceObservation({state:next,availability:available,observation:{observation_id:`96000000-0000-4000-8000-${suffix}`,contract_version:1,evidence_id:available.evidence_id!,project_id:context.project_id,conversation_id:context.conversation_id,target_key:available.target_key,observation_category:"observation",observation_type:type,observation_value:bad?{kind:"evidence_condition",value:null}:{kind:"visibility",value:"visible"},source_actor_class:"admin",observed_at:context.occurred_at,evidence_quality:quality,interpretation_status:status,scope:{request_id:available.request_id!,scope_key:"requested_target"},reason_codes:[reason]}});
      if(!result.success){setError(`Beobachtung abgelehnt: ${result.code}`);return;}next=result.state;
    }
    setObservationState(next);setSelectedObservations([]);setNotice("Beobachtung gespeichert. Noch keine technische Bewertung; offene Fachinformation bleibt unverändert.");
    setMappingResult(undefined);
  };
  const inspectTechnicalDerivation=()=>{
    const observation=observationState.observations.at(-1);if(!observation)return;
    const knowledgeState=last?.success?last.knowledge_state:context.knowledge_state;
    const entityType=observation.target_key==="room_overview"||observation.target_key==="indoor_area_overview"?"room":"installation";
    setMappingResult(proposeKnowledgeClaimFromObservation({observations:[observation],project_id:context.project_id,conversation_id:context.conversation_id,entity_type:entityType,entity_id:context.project_id,knowledge_state:knowledgeState,proposal_ids:{claim_id:"97000000-0000-4000-8000-000000000001",evidence_id:"97000000-0000-4000-8000-000000000002"},occurred_at:context.occurred_at}));
  };
  const replay = () => {
    let replayContext = createSimulatorStart(scenario);
    const replayRuns: SimulatorRun[] = [];
    for (let index = 0; index < raws.length; index++) {
      const execution = executeSimulatorAnswer(
        replayContext,
        raws[index],
        index + 1,
      );
      if (!execution.result) break;
      replayRuns.push(execution.result);
      if (execution.next) replayContext = execution.next;
    }
    for(const [index,response] of evidenceResponses.entries()){
      const previous=replayRuns.at(-1);if(!previous?.success)break;
      const execution=executeSimulatorEvidenceResponse(replayContext,previous,{kind:"evidence_response",...response},raws.length+index+1);
      if(!execution.next)break;replayRuns.push(execution.result);replayContext=execution.next;
    }
    setNotice(
      JSON.stringify(replayRuns) === JSON.stringify(runs)
        ? "Replay stimmt überein"
        : "Replay weicht ab",
    );
  };
  const claims = last?.success
    ? last.knowledge_state.claims
    : context.knowledge_state.claims;
  const active = useMemo(
    () =>
      claims.filter(
        (claim) =>
          !claims.some(
            (candidate) => candidate.supersedes_claim_id === claim.claim_id,
          ),
      ),
    [claims],
  );
  const unknowns = active.filter(
    (claim) => claim.epistemic_status === "unknown",
  );
  const assumptions = active.filter(
    (claim) => claim.epistemic_status === "assumed",
  );
  const contradictions = last?.success ? last.assessment.contradictions : [];
  const missing = last?.success
    ? (last.missing_information as Array<Record<string, unknown>>)
    : [];
  const renderInput = () => {
    if (!interaction) return null;
    const contract = interaction.answer_contract;
    if (!contract || !interaction.customer_visible) return null;
    const options = interaction.answer_options;
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          send({ kind: "text", value });
        }}
      >
        <label className="block font-medium" htmlFor="simulator-answer">
          Synthetische Antwort
        </label>
        {contract.answer_type === "text" ? (
          <textarea
            className="min-h-24 w-full rounded border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
            id="simulator-answer"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
        ) : contract.answer_type === "approximate_number" ? (
          <input
            className="w-full rounded border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
            id="simulator-answer"
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            placeholder="z. B. ca. 25 m²"
            value={value}
          />
        ) : (
          <div id="simulator-answer" />
        )}
        <div className="flex flex-wrap gap-2">
          {contract.answer_type !== "boolean" ? (
            <button
              className="rounded bg-teal-800 px-4 py-2 text-white disabled:opacity-50"
              disabled={pending || !value}
              type="submit"
            >
              Antwort senden
            </button>
          ) : null}
          {options.map((option) => (
            <button
              className="rounded border px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
              disabled={pending}
              key={option.option_key}
              onClick={() =>
                send({ kind: "option", option_key: option.option_key })
              }
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </form>
    );
  };
  return (
    <div aria-busy={pending} className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">
          Administration · ausschließlich synthetisch
        </p>
        <h1 className="text-3xl font-bold">Conversation Simulator</h1>
        <p className="mt-2 text-slate-600">
          Lokaler Testlauf gegen den bestehenden puren Conversation Cycle. Es
          werden keine Daten gespeichert.
        </p>
      </header>
      <section className={box}>
        <div className="flex flex-wrap items-end gap-3">
          <label
            className="flex min-w-64 flex-1 flex-col gap-1 font-medium"
            htmlFor="scenario"
          >
            Szenario
            <select
              className="rounded border p-2"
              id="scenario"
              onChange={(event) =>
                choose(event.target.value as SimulatorScenarioId)
              }
              value={scenario}
            >
              {SIMULATOR_SCENARIOS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border px-4 py-2"
            onClick={() => reset()}
            type="button"
          >
            Szenario zurücksetzen
          </button>
          <button
            className="rounded border px-4 py-2"
            disabled={!raws.length&&!evidenceResponses.length}
            onClick={replay}
            type="button"
          >
            Bisherigen Verlauf erneut ausführen
          </button>
        </div>
        {notice ? (
          <p className="mt-3 text-sm" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded bg-red-50 p-3 text-red-800" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="space-y-4" aria-labelledby="conversation-title">
          <h2 className="text-2xl font-bold" id="conversation-title">
            Conversation
          </h2>
          {messages.map((message) => (
            <article
              className={`${box} ${message.kind === "tester_answer" ? "ml-8 border-teal-300 bg-teal-50" : "mr-8"}`}
              key={message.message_id}
            >
              <p className="text-xs font-bold uppercase">
                {message.kind === "tester_answer"
                  ? "Testerantwort"
                  : message.kind === "evidence_request"
                    ? "Fotoanforderung"
                    : message.kind === "evidence_response"
                      ? "Synthetische Fotoantwort"
                  : message.kind === "system_question"
                    ? "Systemfrage"
                    : "Status"}
              </p>
              <p>{message.primary_text}</p>
              {message.supporting_text ? (
                <p className="mt-2 text-sm">{message.supporting_text}</p>
              ) : null}
            </article>
          ))}
          {interaction ? (
            <article className={`${box} border-teal-500`}>
              <p className="text-xs font-bold uppercase text-teal-800">
                Aktuelle Kundeninteraktion
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                {interaction.primary_text}
              </h3>
              {interaction.supporting_text ? (
                <p className="mt-2">{interaction.supporting_text}</p>
              ) : null}
              {interaction.help_text ? (
                <p className="mt-2 text-sm text-slate-600">
                  {interaction.help_text}
                </p>
              ) : null}
              {interaction.examples.length ? (
                <p className="mt-2 text-sm">
                  Beispiele: {interaction.examples.join(", ")}
                </p>
              ) : null}
              <div className="mt-4">{renderInput()}</div>
            </article>
          ) : last?.success&&last.cycle_status==="evidence_request_selected"&&last.rendered_evidence_request&&last.selected_evidence_request ? (
            <article className={`${box} border-amber-500`}>
              <p className="text-xs font-bold uppercase text-amber-800">Foto benötigt</p>
              <p className="mt-2">{last.rendered_evidence_request.text}</p>
              <p className="mt-2 text-sm">Erwartete Fotos: {last.selected_evidence_request.minimum_count}–{last.selected_evidence_request.maximum_count}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded bg-teal-800 px-4 py-2 text-white" onClick={()=>respondToEvidence("provided")} type="button">Foto als vorhanden simulieren</button>
                <button className="rounded border px-4 py-2" onClick={()=>respondToEvidence("declined")} type="button">Kann ich nicht liefern</button>
                <button className="rounded border px-4 py-2" onClick={()=>respondToEvidence("skipped")} type="button">Überspringen</button>
              </div>
            </article>
          ) : (
            <article className={box} role="status">
              <p className="font-semibold">
                {last?.success &&
                last.cycle_status === "intermediate_result_ready"
                  ? "Zwischenstand erreicht"
                  : (last?.success &&
                        last.cycle_status === "human_review_required") ||
                      (last && !last.success && last.requires_human_review)
                    ? "Fachliche Prüfung erforderlich"
                    : "Fragensammlung beendet"}
              </p>
              {last?.success ? (
                <p className="mt-2 text-sm">
                  Readiness: {last.readiness.readiness_level} · Offene
                  Informationen: {last.missing_information.length}
                </p>
              ) : null}
              {last?.success && last.cycle_status === "intermediate_result_ready" ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm">Der nächste Fragenblock kann jetzt gestartet werden.</p>
                  <button className="rounded bg-teal-800 px-4 py-2 text-white disabled:opacity-50" disabled={pending} onClick={continueConversation} type="button">
                    Gespräch fortsetzen
                  </button>
                </div>
              ) : null}
            </article>
          )}
          {last?.success&&last.evidence_availability.some(item=>item.status==="available_unanalysed") ? <article className={`${box} border-teal-500`}>
            <p className="text-xs font-bold uppercase text-teal-800">Foto vorhanden – Beobachtung simulieren</p>
            <fieldset className="mt-3 space-y-2"><legend className="font-semibold">Kontrollierte Beobachtungen</legend>{observationOptionsForTarget(last.evidence_availability.find(item=>item.status==="available_unanalysed")!.target_key).map(type=><label className="block" key={type}><input checked={selectedObservations.includes(type)} className="mr-2" onChange={event=>setSelectedObservations(current=>event.target.checked?[...current,type]:current.filter(item=>item!==type))} type="checkbox"/>{EVIDENCE_OBSERVATION_DEFINITIONS[type].label}</label>)}</fieldset>
            <button className="mt-4 rounded bg-teal-800 px-4 py-2 text-white disabled:opacity-50" disabled={!selectedObservations.length} onClick={saveObservations} type="button">Beobachtung speichern</button>
            {observationState.observations.length?<><p className="mt-4 font-semibold">Foto vorhanden – ausgewertet</p><ul className="list-disc pl-5 text-sm">{observationState.observations.map(item=><li key={item.observation_id}>{EVIDENCE_OBSERVATION_DEFINITIONS[item.observation_type].label}</li>)}</ul><button className="mt-4 rounded border border-teal-800 px-4 py-2 font-semibold text-teal-900" onClick={inspectTechnicalDerivation} type="button">Technische Ableitung prüfen</button>{mappingResult?<div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3" role="status"><p className="font-bold">{mappingResult.kind==="claim_proposal"?"Claim-Vorschlag möglich":mappingResult.kind==="site_check_required"?"Vor Ort prüfen":mappingResult.kind==="human_review_required"||mappingResult.kind==="conflicting_observations"?"Fachliche Prüfung erforderlich":"Nur Beobachtung"}</p>{mappingResult.kind==="claim_proposal"?<><dl className="mt-2 text-sm"><dt>Property</dt><dd>{propertyLabels[mappingResult.claim_proposal.property_key]??mappingResult.claim_proposal.property_key}</dd><dt>Vorgeschlagener Wert</dt><dd>{String(mappingResult.claim_proposal.value)}</dd><dt>Epistemischer Status</dt><dd>{statusLabels[mappingResult.claim_proposal.epistemic_status]??mappingResult.claim_proposal.epistemic_status}</dd><dt>Review Class</dt><dd>{mappingResult.review_class}</dd></dl><p className="mt-2 font-bold text-amber-900">Noch nicht in den Knowledge State übernommen.</p></>:mappingResult.kind==="observation_only"||mappingResult.kind==="insufficient_evidence"||mappingResult.kind==="unsupported_mapping"||mappingResult.kind==="invalid_context"?<p className="mt-2 text-sm">Aus dieser Beobachtung wird keine technische Aussage abgeleitet.</p>:null}</div>:<p className="mt-2 font-semibold text-amber-800">Noch keine technische Bewertung.</p>}</>:null}
          </article>:null}
        </section>
        <aside className="space-y-3" aria-label="Intelligence Inspector">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Intelligence Inspector</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={debug}
                onChange={(event) => setDebug(event.target.checked)}
                type="checkbox"
              />
              Technische Details anzeigen
            </label>
          </div>
          <details className={box} open>
            <summary className="cursor-pointer font-bold">Übersicht</summary>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt>State Version</dt>
              <dd>
                {last?.success
                  ? last.current_state_version
                  : context.knowledge_state.state_version}
              </dd>
              <dt>Readiness Level</dt>
              <dd>
                {last?.success
                  ? last.readiness.readiness_level
                  : "Noch nicht berechnet"}
              </dd>
              <dt>Aktive Claims</dt>
              <dd>{active.length}</dd>
              <dt>Unknowns</dt>
              <dd>{unknowns.length}</dd>
              <dt>Annahmen</dt>
              <dd>{assumptions.length}</dd>
              <dt>Widersprüche</dt>
              <dd>{contradictions.length}</dd>
              <dt>Site-Check-Punkte</dt>
              <dd>
                {last?.success ? last.assessment.site_check_items.length : 0}
              </dd>
              <dt>Nächste Aktion</dt>
              <dd>
                {last?.success
                  ? last.planner_result.kind === "selected_action"
                    ? last.planner_result.action.action_type
                    : last.planner_result.stop.next_action_type
                  : "Initiale Frage"}
              </dd>
            </dl>
          </details>
          <details className={box} open>
            <summary className="cursor-pointer font-bold">
              Knowledge State
            </summary>
            {active.length ? (
              <ul className="mt-3 space-y-2">
                {active.map((claim) => (
                  <li className="rounded border p-2" key={claim.claim_id}>
                    <strong>
                      {propertyLabels[claim.property_key] ?? "Fachinformation"}
                    </strong>
                    <br />
                    {claim.value === null
                      ? "Unbekannt"
                      : typeof claim.value === "boolean"
                        ? claim.value
                          ? "Ja"
                          : "Nein"
                        : String(claim.value)}{" "}
                    {claim.property_key === "room_area_sqm" &&
                    claim.value !== null
                      ? "m²"
                      : ""}
                    <br />
                    <span className="text-sm">
                      {statusLabels[claim.epistemic_status]} ·{" "}
                      {claim.evidence[0]?.source_type}
                    </span>
                    {debug ? (
                      <code className="mt-1 block text-xs">
                        {claim.property_key} · {claim.claim_id}
                      </code>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">Noch keine Claims.</p>
            )}
          </details>
          <details className={box} open>
            <summary className="cursor-pointer font-bold">State Diff</summary>
            <p className="mt-3 text-sm">
              {last?.success &&
              last.current_state_version !== last.previous_state_version
                ? `Neu: ${last.current_state_version - last.previous_state_version} State-Version`
                : "Keine Änderung am Knowledge State"}
            </p>
            {last?.success ? (
              <p className="text-sm">
                Unknown: {unknowns.length} · Annahme: {assumptions.length} ·
                Widerspruch: {contradictions.length}
              </p>
            ) : null}
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">Evidence Requests</summary>
            {last?.success&&last.evidence_request_state.requests.length?<ul className="mt-3 space-y-2 text-sm">{last.evidence_request_state.requests.map(request=><li key={request.request_id}><strong>{request.target_key}</strong> · {request.status}<br/>Unterstützt: {request.requested_for_information_keys.map(key=>propertyLabels[key]??key).join(", ")}<br/>{observationState.observations.some(item=>item.scope.request_id===request.request_id)?"Foto vorhanden – ausgewertet":last.evidence_availability.some(item=>item.request_id===request.request_id&&item.status==="available_unanalysed")?"Foto vorhanden – noch nicht ausgewertet":"Noch keine Evidence vorhanden"} · Versuche: {request.attempts}{debug?<code className="block">{request.request_id}</code>:null}</li>)}</ul>:<p className="mt-3 text-sm">Keine Evidence Requests.</p>}
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">Readiness</summary>
            {last?.success ? (
              <>
                <p className="mt-3">
                  Aktuell: {last.readiness.readiness_level}
                  <br />
                  Ziel: Level 3 – Vorläufige Installationsbewertung
                </p>
                <ul className="mt-2 text-sm">
                  {Object.entries(last.readiness.readiness_dimensions).map(
                    ([key, dimension]) => (
                      <li key={key}>
                        <strong>{key}:</strong> {dimension.status}; Blocker:{" "}
                        {dimension.blockers.join(", ") || "keine"}
                      </li>
                    ),
                  )}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-sm">Nach dem ersten Cycle verfügbar.</p>
            )}
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">
              Offene Informationen
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {missing.map((item, index) => (
                <li key={index}>
                  <strong>
                    {propertyLabels[String(item.information_key)] ??
                      "Fachinformation"}
                  </strong>{" "}
                  · {String(item.importance)} · blockiert{" "}
                  {String(item.blocks_level)}
                  <br />
                  Annahme: {item.can_use_assumption ? "Ja" : "Nein"} · Vor Ort:{" "}
                  {item.can_require_site_check ? "Ja" : "Nein"}
                  {debug ? (
                    <code className="block">
                      {String(item.information_key)} ·{" "}
                      {String(item.reason_code)}
                    </code>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">Planner</summary>
            {last?.success ? (
              last.planner_result.kind === "selected_action" ? (
                <div className="mt-3 text-sm">
                  <p>
                    Selected Action: {last.planner_result.action.action_type}
                  </p>
                  <p>Priorität: {last.planner_result.action.priority_band}</p>
                  <p>Progressionsband: {last.planner_result.action.progression_band}</p>
                  <p>Dependencies: {last.planner_result.action.dependency_status}</p>
                  <p>Collection: {last.planner_result.action.collection_eligibility}</p>
                  <p>Revisit: {last.planner_result.action.revisit_status}</p>
                  <p>Erkenntnisweg: {collectionPathLabels[last.planner_result.action.collection_path]}</p>
                  <p>Grund: {last.planner_result.action.gain_reason_codes.map(code=>gainReasonLabels[code]).join(", ")}</p>
                  <p>
                    Score: {last.planner_result.action.score_breakdown.total}
                  </p>
                  <p className="font-medium">
                    Interner Rankingwert – keine Sicherheitsschätzung
                  </p>
                  {debug ? (
                    <pre className="mt-2 max-h-48 overflow-auto text-xs">
                      {JSON.stringify(last.planner_result.action, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3">
                  Stop: {last.planner_result.stop.next_action_type}
                </p>
              )
            ) : (
              <p className="mt-3 text-sm">Initiale kontrollierte Frage.</p>
            )}
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">
              Retry &amp; Aufwand
            </summary>
            {last?.success ? (
              <div className="mt-3 text-sm">
                <p>Maximal 2 Versuche · maximal 4 technische Folgefragen</p>
                <p>
                  Technische Folgefragen:{" "}
                  {last.customer_effort_state.consecutive_technical_questions}
                </p>
                <p>
                  Unbeantwortet:{" "}
                  {last.customer_effort_state.unanswered_questions} ·
                  Wiederholt: {last.customer_effort_state.repeated_questions}
                </p>
                {last.retry_state.items.map((item) => (
                  <p key={`${item.information_key}-${item.entity_id}`}>
                    {propertyLabels[item.information_key] ?? "Information"}:{" "}
                    {item.attempts} · {item.last_outcome}
                  </p>
                ))}
              </div>
            ) : null}
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">Events</summary>
            <ol className="mt-3 space-y-2 text-sm">
              {runs
                .flatMap((run) => (run.success ? run.events : []))
                .map((event) => (
                  <li key={event.event_id}>
                    {event.sequence}.{" "}
                    {eventLabels[event.event_type] ?? event.event_type}
                    {debug ? (
                      <code className="block text-xs">
                        {event.event_id} · State {event.state_version_before} →{" "}
                        {event.state_version_after} · {event.correlation_id}
                      </code>
                    ) : null}
                  </li>
                ))}
            </ol>
          </details>
          <details className={box}>
            <summary className="cursor-pointer font-bold">
              Pipeline (read-only)
            </summary>
            {[
              "Raw Answer",
              "Normalized Answer",
              "Interpretation",
              "State Transition",
              "Recalculation",
              "Planner",
              "Rendering",
              "Evidence Request Planning",
              "Evidence Response / Replanning",
              "Evidence Observation",
              "Observation-to-Claim Mapping",
              "Claim Proposal / Observation Only / Review / Site Check",
            ].map((step) => (
              <details className="mt-2 rounded border p-2" key={step}>
                <summary>{step}</summary>
                <p className="mt-1 text-xs">
                  Ergebnis des vollständigen Cycles; keine Einzelausführung.
                </p>
              </details>
            ))}
            <p className="mt-3 text-sm font-semibold">State Transition: noch nicht ausgeführt.</p>
          </details>
          {debug ? (
            <details className={box} open>
              <summary className="cursor-pointer font-bold">Debug</summary>
              <pre className="mt-3 max-h-80 overflow-auto text-xs">
                {JSON.stringify(
                  last ?? {
                    initial_state: initial.knowledge_state,
                    interaction,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function interactionMessage(
  interaction: RenderedCustomerInteraction,
  cycle: number,
): Message {
  return {
    message_id: `interaction-${cycle}-${interaction.decision_id}`,
    kind: "system_question",
    primary_text: interaction.primary_text,
    supporting_text: interaction.supporting_text,
    answer_options: interaction.answer_options.map((option) => option.label),
    cycle_index: cycle,
  };
}

function statusMessage(
  cycle: number,
  kind: Message["kind"],
  primary_text: string,
  supporting_text?: string,
): Message {
  return {
    message_id: `status-${cycle}-${kind}`,
    kind,
    primary_text,
    supporting_text,
    cycle_index: cycle,
  };
}

export function activeInteractionFor(
  result: SimulatorRun,
): RenderedCustomerInteraction | null {
  return result.success &&
    result.planner_result.kind === "selected_action" &&
    result.rendered_interaction?.customer_visible &&
    result.rendered_interaction.answer_contract
    ? result.rendered_interaction
    : null;
}

function cycleStatusMessage(
  result: Extract<SimulatorRun, { success: true }>,
  cycle: number,
): Message {
  if(result.cycle_status==="evidence_request_selected"&&result.rendered_evidence_request)return{message_id:`evidence-request-${cycle}-${result.selected_evidence_request?.request_id}`,kind:"evidence_request",primary_text:result.rendered_evidence_request.text,supporting_text:"Foto benötigt",cycle_index:cycle};
  if (result.rendered_interaction)
    return statusMessage(
      cycle,
      "intermediate",
      result.rendered_interaction.primary_text,
      result.rendered_interaction.supporting_text,
    );
  if (result.cycle_status === "intermediate_result_ready")
    return statusMessage(cycle, "intermediate", "Zwischenstand erreicht");
  if (result.cycle_status === "human_review_required")
    return statusMessage(
      cycle,
      "human_review",
      "Fachliche Prüfung erforderlich",
    );
  return statusMessage(cycle, "site_check", "Fragensammlung beendet");
}
