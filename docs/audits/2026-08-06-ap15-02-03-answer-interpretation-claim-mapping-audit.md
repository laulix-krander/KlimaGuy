# AP-15-02-03-00 — Answer Interpretation and Knowledge Claim Mapping: Architektur-, Domain- und Safety-Audit

## 1. Audit-Metadaten

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-06-AP15-02-03-00-ANSWER-INTERPRETATION-CLAIM-MAPPING-V1` |
| Datum | 2026-08-06 |
| Paket | AP-15-02-03-00 |
| Typ | Audit, Analyse, Domain- und Sicherheitsplanung, Dokumentation; keine Implementierung |
| Branch | `codex/audit-ap15-02-03-answer-claim-mapping` |
| Baseline | lokaler HEAD `b2bd9389214dca0a6e59c0613bd0de8dc9fe0df4` |
| Remote | Kein Git-Remote konfiguriert; ein Remotevergleich war nicht möglich. Die Baseline ist im Review gegen den autoritativen Hauptbranch zu prüfen. |
| Auditstatus | **READY FOR OWNER DECISION** |
| Freigabe | ausdrücklich **nicht** `APPROVED FOR IMPLEMENTATION` und nicht Production Ready |

## 2. Scope

Dieses Paket entwirft ausschließlich die kontrollierte Grenze zwischen einer bereits technisch normalisierten Kundenantwort und einem noch nicht angewandten fachlichen Zustandsübergang. Gegenstand sind Bindungen, statische Mappingregeln, Evidence-/Claim-/Transition-Proposals, epistemische Einordnung, Nicht-Wert-Outcomes, Konflikte, Idempotenz, Concurrency, Review und Erklärbarkeit.

Ausgeschlossen sind ausführbarer Mapper, Registry oder Domain-TypeScript, Claim-/Evidence-Erzeugung, jede State-/Retry-Mutation, Events, Orchestrierung, UI, Simulator, Route, Action, Service, Persistenz, Migration/SQL/RPC/RLS/Grants, Supabase, KI/LLM/Vision, WhatsApp, Prompts, Fotos, Preis/Angebot, Tests, Dependencies und `package.json`.

## 3. Ausgangslage

AP-15-01 implementiert typisierte `KnowledgeClaim`s, `EvidenceReference`s, epistemische Status, versionierten `KnowledgeState`, append-only `addClaim`/`supersedeClaim`, effektive Claims, Widerspruchserkennung, Missing Information, Readiness und Intermediate Assessments. AP-15-02-01 implementiert den deterministischen Planner mit genau einer Aktion, Retrygrenzen, Unknown/Skip, Annahme, Site Check, Human Review und Stop Results. AP-15-02-02-01 bindet statische deutsche Templates und deklarative Answer Contracts; AP-15-02-02-02 bindet Rohantworten und normalisiert Text, Boolean, Einzelzahl, Approximation, Range sowie Non-Value-Outcomes.

Es fehlt bewusst die fachliche Interpretation. `NormalizedCustomerAnswer` enthält weder Property-/Entityentscheidung noch Evidenz oder epistemischen Status. Entsprechend fehlen Mapping, Proposals, State-Anwendung, Retry-/Event-Anwendung, Konfliktauflösung, Late-Answer-Regeln und Orchestrierung.

## 4. Bestehende Domainkette

Die geprüfte, nicht zu duplizierende Kette lautet:

1. `KnowledgeState` bindet `project_id`, `conversation_id`, positive `state_version`, Claims und `updated_at`.
2. `deriveMissingInformation` und `deriveReadiness` sind Derivate; `buildIntermediateAssessment` bindet eine State-Version.
3. `PlannerContext` bindet Knowledge State, Missing Information, Assessment, Retry-/Effort-State und aktive Frage.
4. `SelectedNextAction` bindet `decision_id`, Projekt, Conversation, `based_on_state_version`, Candidate, `information_key`, `entity_type`, `entity_id`, Action, optional Answer Contract, Template-Key/-Version und Assumption-Key.
5. `RenderedCustomerInteraction` bindet Projekt, Conversation, Decision, Template-Key/-Version, Locale und den vollständigen deklarativen Answer Contract. Es enthält absichtlich keine Entity- oder Property-ID; diese bleiben in der serverseitigen Action.
6. `RawCustomerAnswer` bindet `answer_id`, Projekt, Conversation, Decision, Template-Key/-Version, Locale und Zeitpunkt.
7. `NormalizedCustomerAnswer` erhält diese Bindung und liefert `answered` mit `text`, `boolean`, `number` oder `number_range`, beziehungsweise `unknown`, `skipped`, `assumption_confirmed`, `assumption_rejected`, `deferred` oder formal `invalid`.
8. Erst die hier geplante Interpretation darf aus allen vier serverseitig zusammengeführten Verträgen ein Proposal ableiten. Normalisierung allein ist keine fachliche Wahrheit.

Bestehende Claimgrenzen sind exakt: Entitytypen `project`, `room`, `installation`; Werte `string`, positive finite `number`, `boolean` oder `unknown` mit `null`. Ein Claim verlangt mindestens eine Evidence Reference. Bereiche und Approximation-Metadaten werden derzeit nicht unterstützt. `addClaim` verlangt `claim.state_version = state.state_version + 1`; `supersedeClaim` verlangt identische Entity/Property und einen passenden `supersedes_claim_id`. Ein Transition mit mehreren Claims kann daher nicht blind als atomarer Aufruf von `addClaim` verstanden werden und braucht vor Implementierung eine explizite Versions-/Batchentscheidung.

Bestehende Events sind nur `customer_message_received`, `internal_note_added`, `knowledge_claim_recorded`, `knowledge_claim_superseded`, `assessment_created` und `reviewer_correction_recorded`. Answer-Interpretation, Unknown, Skip und Annahme besitzen noch keine Eventtypen.

## 5. Produktprinzipien

1. Normalisierung ist Syntax, keine Bestätigung.
2. Direkte Kundenaussagen sind grundsätzlich `reported`, niemals automatisch `confirmed`.
3. Quelle, Antwortart und kontrollierte Regel bestimmen Status; kein Clientfeld tut dies.
4. Property, Entitytyp, Entity-ID, Evidencequelle und Status sind ausschließlich servergebunden.
5. Namensgleichheit von Information- und Property-Key ersetzt keine explizite Registryregel.
6. Unknown und Skip sind verschieden; Skip ist keine Wertbehauptung.
7. Annahmebestätigung bleibt `assumed`; der Wert stammt aus einer serverseitigen Assumption Rule.
8. Widerspruch wird sichtbar und niemals still überschrieben.
9. Supersession ist append-only; Originalclaim und Originalevidenz bleiben erhalten.
10. Reviewer-Korrekturen werden nicht durch normale Kundenantworten automatisch verdrängt.
11. State-Version, Decision, Template, Answer und Quelle müssen exakt zusammenpassen.
12. Gleiches validiertes Input/State erzeugt deterministisch dasselbe Proposal.
13. Mapper erzeugen weder technische Freigabe noch Preis/Angebot, Readiness, nächste Frage oder Kundentext.
14. Stale Inputs sind im MVP fail closed.

## 6. Begriffsdefinitionen und Schichtentrennung

| Begriff | Präzise Bedeutung |
|---|---|
| Answer Interpretation | Pure fachliche Bewertung eines gebundenen `NormalizedCustomerAnswer` anhand einer geschlossenen Regel und exakt einer State-Version; Ergebnis ist ein Proposal, kein angewandter Fakt. |
| Mapping Rule | Immutable Regel, die einen Information Key und zulässige Entity an Property, normalisierten Werttyp, Value-/Status-/Unknown-/Skip-/Konflikt-/Supersession-/Evidenceverhalten bindet. |
| Mapping Registry | Build-time bekannte, tief unveränderliche und vollständig validierte Menge eindeutiger Mapping Rules; keine Runtime-/DB-/Clientregistrierung. |
| Interpretation Context | Unveränderlicher, vollständig servergebundener Umschlag aus State, Action, Interaction, Answer, Retry und Quellenreferenz. |
| Source Binding | Nachweis, dass Answer-ID zur serverseitig bekannten Message-ID, Actor-Klasse, Conversation und Decision gehört. |
| Entity Binding | Übernahme von Typ/ID ausschließlich aus `SelectedNextAction` plus Prüfung gegen State/Projektkontext. |
| Property Binding | Explizite Registrybestätigung, dass `information_key` genau auf den erlaubten Claim-Key der Entity abbildet. |
| Value Mapping | Verlustfreie, typgebundene Überführung eines normalisierten Werts in den bestehenden Claimwert oder ein kontrolliertes Nicht-Mapping. |
| Epistemic Mapping | Regelgebundene Wahl von `reported`, `assumed`, `unknown` oder `requires_site_check`; nicht vom Werttext bestimmt. |
| Claim Proposal | Unveränderlicher Entwurf eines Claims einschließlich ID, Bindungen, Wert/Status, Evidence-Refs und optionaler Supersession; noch nicht Statebestandteil. |
| Evidence Proposal | Datensparsamer Entwurf einer opaque Quellenreferenz; keine Nachricht oder Providerdaten. |
| State Transition Proposal | Vollständige, versionsgebundene Absicht, Claims/Evidenz/Supersessions/optionale Event- und Retryeffekte später atomar anzuwenden. |
| Accepted Answer | Alle Bindungen und Regeln sind gültig; ein deterministisches fachliches Proposal kann entstehen, auch als `no_state_change`. |
| Rejected Answer | Fail-closed Ergebnis ohne Stateänderung wegen ungültiger Bindung, unsupported Mapping oder Sicherheitsgrenze. |
| Deferred Answer | Gültiges `deferred`-Outcome; Wert bleibt offen, keine Wertbehauptung, spätere Planung erforderlich. |
| Duplicate Answer | Dieselbe gebundene `answer_id` wurde bereits interpretiert oder angewandt. |
| Stale Answer | Answer basiert auf einer nicht aktuellen State-/Decision-/Templatebindung. |
| Late Answer | Zeitlich verspätete Antwort; sie ist nur dann stale, wenn ihre Bindung nicht mehr aktuell ist. Im MVP führt die regelmäßig alte State-Version dennoch fail closed. |
| Contradictory Answer | Neuer Wert ist mit mindestens einem wirksamen Claim derselben Entity/Property unvereinbar. |
| Superseding Answer | Antwort in einem explizit servermarkierten Correction Context, die einen konkret gebundenen Vorgänger ersetzen darf. |
| Non-Value Outcome | `unknown`, `skipped`, `assumption_rejected`, `deferred` oder invalid; keine normale Wertantwort. |
| Assumption Confirmation | Explizites Outcome zu einem allowlisteten Action-`assumption_key`; bestätigt Kundenakzeptanz, nicht technische Wahrheit. |
| Site-Check Outcome | Systemseitig geplanter offener Prüfpunkt mit `null`/`requires_site_check`, nicht Kundenfakt oder Freigabe. |
| Mapping Explanation | Geschlossene Codes und Referenzen, die Regel, Bindung, Status, Konflikt und Ergebnis nennen; keine Chain-of-Thought. |
| Idempotency Key | Stabile serverseitige Bindung `conversation_id + decision_id + answer_id`, nicht Text oder Wert. |

**Schichten:** Technische Normalisierung prüft/vereinheitlicht Eingaben. Fachliche Interpretation erstellt Proposals. Claim-Erzeugung materialisiert IDs/Verträge. State-Mutation wendet ein Proposal mit Versionskontrolle an. Danach werden Missing Information, Readiness und Assessment neu abgeleitet; zuletzt plant der Planner neu. Keine Schicht darf die nächste heimlich vorwegnehmen.

## 7. Variantenvergleich

Skala: `++` sehr gut, `+` gut, `0` gemischt, `-` schwach, `--` unzulässig.

| Kriterium | A Normalizer | B Template-Switch | C Info-Registry | D LLM | E Registry + pure Pipeline | F Event Sourcing |
|---|---:|---:|---:|---:|---:|---:|
| Sicherheit | -- | 0 | + | -- | ++ | ++ |
| Testbarkeit | - | + | ++ | -- | ++ | + |
| Determinismus | + | + | ++ | -- | ++ | ++ |
| Wartbarkeit | -- | - | + | - | ++ | 0 |
| Erweiterbarkeit | - | - | + | + | ++ | ++ |
| Widersprüche | -- | - | 0 | - | ++ | ++ |
| Idempotenz | - | - | 0 | -- | ++ | ++ |
| Auditierbarkeit | - | 0 | + | -- | ++ | ++ |
| Race Conditions | -- | - | 0 | -- | ++ | ++ |
| LLM-Unabhängigkeit | ++ | ++ | ++ | -- | ++ | ++ |
| WhatsApp-Eignung | 0 | + | + | 0 | ++ | + |
| MVP-Komplexität | + scheinbar | + | + | 0 | + | -- |
| spätere Bildanalyse | -- | - | + | + | +, eigener Quellenpfad | ++ |
| Reviewer-Korrekturen | -- | - | 0 | -- | ++ | ++ |

- **A** verletzt die bestehende Schichtgrenze und vermischt technische Akzeptanz mit fachlicher Wahrheit.
- **B** koppelt Fachlogik an Sprach-/Darstellungsversionen und skaliert schlecht.
- **C** löst Bindung, aber noch nicht Apply-/Concurrency-/Erklärbarkeitsgrenzen.
- **D** ist für Keys, Status, Claims und Supersession nicht kontrollierbar und ausgeschlossen.
- **E** trennt deterministisches Proposal von versionsgeschützter Anwendung und ist der kleinste belastbare Weg.
- **F** ist langfristig auditierbar, aber verlangt Eventversionierung, Projektionen, Rebuild und Betrieb außerhalb des MVP.

## 8. Architekturentscheidung

**Eindeutige Empfehlung: Variante E.** Eine statische Registry und ein strikter `InterpretationContext` erzeugen durch eine pure Funktion ausschließlich ein `StateTransitionProposal`. Ein separater, späterer `applyProposal`-Pfad prüft Idempotenz und Compare-and-set erneut, materialisiert den neuen State append-only und kann Events/Retryeffekte atomar anwenden. Erst anschließend folgen Ableitungen und Replanning.

Das Audit erteilt keine Implementierungsfreigabe. Die Architektur ist bewusst zweistufig: `interpretAnswer(context) -> proposal | closed error`; später `applyProposal(currentState, proposal) -> next state | idempotent success | conflict`. Systemaktionen wie Site Check gehören nicht in den Customer-Answer-Mapper.

## 9. Interpretation Context

Planvertrag, nicht Code:

```text
InterpretationContext {
  project_id, conversation_id, current_state_version,
  knowledge_state, selected_action, rendered_interaction,
  normalized_answer, retry_state,
  source_message_id, source_actor_class: customer,
  interpreted_at, interpretation_id
}
```

Alle IDs, Decision, Template-Key/-Version, Locale und Projekt/Conversation müssen transitiv identisch sein. `knowledge_state.state_version`, `current_state_version` und `selected_action.based_on_state_version` müssen gleich sein. Interaction muss aus der Action stammen, Answer aus der Interaction. Der zur Need-/Entitybindung passende Retry-Eintrag darf höchstens vorhanden sein; inkonsistente Duplikate schließen den Kontext. `source_message_id`, `interpreted_at`, `interpretation_id` und IDs zukünftiger Proposals werden serverseitig bereitgestellt, damit die pure Funktion weder Uhr noch Zufall benötigt.

`source_actor_class` ist im ersten MVP ausschließlich `customer`. Freie Property Keys, Entitywerte, Status, Evidencearten, Assumptionwerte, Correctionmarker und clientgenerierte Domainzeiten sind verboten.

## 10. Mapping Registry

Jede tief eingefrorene Regel bindet mindestens:

```text
rule_id/version; information_key; allowed_entity_type; property_key;
normalized_value_kind; unit/approximation policy; value_mapper;
epistemic_policy; unknown_policy; skip_policy;
contradiction_policy; supersession_policy; evidence_source_type
```

Identität ist `rule_id + version`, fachliche Eindeutigkeit `information_key + entity_type`. Registryaufbau validiert Duplikate, Property-/Entity- und Werttypkompatibilität vollständig. Lookup hat keinen Fallback über gleiche Namen. Keine Runtime-Mutation, dynamische Registrierung, Datenbankregistry, Clientregel oder generative Erweiterung.

## 11. Information-/Property-Bindung

Die bestehende AP-15-01-Struktur ergibt folgende explizit zu registrierende MVP-Matrix:

| `information_key` | zulässige Entity | `property_key` | normalisierter Wert | Claimwert | MVP-Entscheidung |
|---|---|---|---|---|---|
| `room_type` | `room` | `room_type` | `text` | `string` | nur freigegebene Allowlist; sonst Review |
| `room_area_sqm` | `room` | `room_area_sqm` | `number`, Einheit `sqm` | positive `number` | exact möglich; approximate nur nach Metadaten-Gate; Range nicht unterstützt |
| `building_type` | `project` | `building_type` | `text` | `string` | nur freigegebene Allowlist; sonst Review |
| `indoor_unit_position_known` | **`room`** | `indoor_unit_position_known` | `boolean` | `boolean` | eindeutig; nicht `installation` |
| `outdoor_unit_position_known` | `installation` | gleichnamig | `boolean` | `boolean` | eindeutig |
| `line_route_known` | `installation` | gleichnamig | `boolean` | `boolean` | eindeutig |
| `electrical_supply_known` | `installation` | gleichnamig | `boolean` | `boolean` | eindeutig |
| `accessibility_known` | `installation` | gleichnamig | `boolean` | `boolean` | eindeutig |

Die Matrix folgt `PROPERTY_KEYS` und den bestehenden string/number/boolean-Keygruppen. Gleichnamigkeit ist nur Beobachtung, nicht Prüfung. Fehlende Regel: `mapping_rule_not_found`; abweichendes Property: `information_property_mismatch`; falscher Typ/ID: `entity_type_mismatch`/`entity_id_mismatch`; inkompatibler Value: `answer_value_type_mismatch`.

## 12. Entity Binding

Entitytyp und -ID kommen ausschließlich aus `SelectedNextAction`, die ihrerseits aus serverseitigem Planner Context stammt. Answer, Option, Templateparameter, URL, Clientpayload und Freitext dürfen sie weder liefern noch überschreiben.

Domainseitig ist zu prüfen: Typ entspricht Registryregel; die ID entspricht Action und Need; bei Nicht-Projekt-Entities existiert sie im gebundenen Knowledge-/Projektkontext; sie gehört zum Projekt. Der heutige State besitzt keine Entity-Liste und beweist Existenz allenfalls indirekt über Claims. Daher braucht der spätere Aufrufer eine kontrollierte serverseitige Entity-Snapshotbindung. Soft Delete/Supersession sind im späteren Persistenzpfad unmittelbar vor Apply erneut zu prüfen. Ohne Beleg: `entity_not_found` beziehungsweise Human Review, niemals Rückfall auf `project_id`.

## 13. Evidence Proposal

Minimaler Proposalvertrag:

```text
EvidenceProposal {
  evidence_id, source_type, source_id,
  actor_class, observed_at, evidence_status
}
```

Für Kundenantworten gilt exakt `customer_message`, servergebundene `source_message_id`, `customer`, serverseitig gebundener Beobachtungszeitpunkt und `active`. Das passt zum bestehenden Schema, dessen `source_id` eine UUID ist. **MVP-Empfehlung:** `message_id` ist primäre Evidence-Quelle, weil Evidence die tatsächliche Aussagequelle referenziert; `answer_id` dient der Idempotenz/Interpretationsbindung und darf im Transition Proposal stehen. Die serverseitige Source-Binding-Tabelle muss `answer_id -> message_id` beweisen. Falls Antworten keine persistierte Message besitzen, ist die Evidencegrenze vor Implementierung neu zu auditieren; `answer_id` darf nicht still umgedeutet werden.

Evidence enthält keinen Text, Telefonnummer, E-Mail, Adresse, URL, Token, Datei, Bild, Providerpayload oder Kanalmetadaten. Annahmen können mehrere Evidence References tragen; das bestehende Claimmodell unterstützt ein Array mit mindestens einem Eintrag.

## 14. Epistemische Status

| Ursprung/Outcome | Status | Begründung |
|---|---|---|
| klare direkte Kundenangabe, Boolean, exakte Zahl | `reported` | authentische Kundenbehauptung, keine technische Bestätigung |
| ungefähre Kundenzahl | empfohlen `reported` | Approximation beschreibt Wertqualität, nicht Quellenklasse |
| kontrolliert bestätigte Systemannahme | `assumed` | Kundenbestätigung verwandelt Annahme nicht in Fakt |
| ausdrücklich unbekannt | `unknown` mit `null` | bestehendes Modell unterstützt diesen Zustand |
| offener Vor-Ort-Punkt | `requires_site_check` mit `null` | keine bestätigte technische Aussage |
| Reviewer-Korrektur | abhängig vom gesonderten Reviewer-Vertrag | niemals durch Customer Mapper festlegen |

`estimated` sollte fachlichen/systemischen Schätzungen vorbehalten bleiben. Weil das bestehende Claimmodell keine Approximation-Metadaten besitzt, kann eine ungefähre Zahl derzeit nicht vollständig verlustfrei als bloßer `reported`-Number-Claim gespeichert werden; dies ist Owner-/Schema-Gate. Widersprüche ändern die ursprünglichen Status nicht in `contradicted`: parallele effektive Claims plus `findContradictions` bilden den Konflikt ehrlich ab.

## 15. Value Mapping

Value Mapping ist total pro freigegebener Rule und fail closed außerhalb davon. `text` darf nur nach expliziter Allowlist/Aliasnormalisierung einen begrenzten String liefern. `boolean` wird identisch als true/false übernommen. Positive Einzelzahlen müssen Property, Einheit, Precision und bestehendem Claim-Schema entsprechen. Kein Parsing findet hier erneut statt; technische Normalisierung wird nicht dupliziert. Keine freie Objektablage, kein Null für normale Werte, keine Einheitenkonversion und kein LLM.

## 16. Textinterpretation

Das bestehende Claim-Schema erlaubt beliebige getrimmte Strings bis 120 Zeichen, besitzt aber keine Raum-/Gebäude-Enum. Die Templatebeispiele sind keine fachliche Allowlist. Daher wäre direktes Speichern von „Wohnzimmer“ zwar schemaformal, aber nicht kontrolliert genug.

Varianten: A lässt Text unmapped; B führt eine fachlich freigegebene kleine Allowlist mit kanonischen Werten und eindeutigen Aliasen ein; C verschiebt Klassifikation auf ein späteres LLM. **Kleinster sicherer MVP:** AP-15-02-03-01 implementiert zunächst keine freie Textklassifikation. Owner kann B in einem eigenen freigegebenen Katalog zulassen. Die im Auftrag genannten Raum-/Gebäudearten sind Kandidaten, keine freigegebenen Domainwerte. Unbekannter oder mehrdeutiger Text ergibt `unsupported_text_mapping` und Human Review, nicht automatische Knowledge Extraction.

## 17. Boolean Mapping

`true` und `false` werden unverändert als `boolean` mit `reported` vorgeschlagen. `false` ist weder Unknown noch fehlend. Bei `outdoor_unit_position_known = false` lautet die Aussage ausschließlich: Der Kunde kennt aktuell keine Position. Sie bedeutet weder, dass keine Position existiert, noch technische Unmöglichkeit. Der Claim kann den Ja/Nein-Informationsbedarf fachlich beantworten und zugleich durch getrennte Readiness-/Plannerregeln einen Bedarf nach Position, Alternative, Site Check oder Review auslösen. Der Mapper trifft diese Folgewahl nicht.

## 18. Zahlen und Bereiche

- `exact`: positiver Einzelwert und Einheit passen; `reported` Number-Proposal.
- `approximate`: Quelle bleibt `reported`; Approximation muss sichtbar erhalten werden. Das aktuelle Claimmodell besitzt dafür weder Metadatum noch strukturierten Value. Bis zu einer Ownerentscheidung/gesonderten Schemaerweiterung fail closed beziehungsweise Human Review; keinesfalls Information still verlieren.
- `number_range`: Das Claimmodell akzeptiert nur einen positiven Einzelwert. Kein Mittelwert, keine Unter-/Obergrenzenwahl, kein Stringtrick. Ergebnis `numeric_range_not_supported`, ohne Stateänderung, mit kontrolliertem Folge-/Reviewpfad.
- Keine Umrechnung; `sqm` muss der Rule entsprechen. Precision und positive Werte werden bereits technisch geprüft, fachliche Plausibilitätsgrenzen bleiben eigenes Owner Gate.

## 19. Unknown

Varianten A nur Retry, B Unknown Claim, C Event+Retry, D Claim+Event+Retry. **Empfehlung:** fachlich B als Claim Proposal plus getrennt geplanter Retryeffekt; ein Event kann erst im späteren Eventpaket ergänzt werden. Das bestehende Modell unterstützt `value_type: unknown`, `value: null`, `epistemic_status: unknown` für jeden erlaubten Property Key. So bleibt „ausdrücklich unbekannt“ von „nie gefragt“ unterscheidbar und kann append-only durch einen späteren Wert supersediert werden.

Unknown erfüllt Missing Information nicht: Die heutige `deriveMissingInformation` behandelt vorhandene Claims pauschal als vorhanden und würde Unknown fälschlich aus der Missing-Liste entfernen, während `deriveReadiness` Unknown nicht als nutzbar ansieht. Das ist ein **Production Gate**: Ableitung muss vor Unknown-Anwendung konsistent korrigiert und separat getestet werden. RetryState bleibt unabhängig erforderlich. Unknown nach einem bekannten Wert supersediert diesen nicht automatisch.

## 20. Skip

Skip ist keine Aussage über die Property. Ein Unknown- oder Nullclaim wäre irreführend. Empfehlung: kein Property Claim, `skip_recorded`/`no_state_change` Proposal mit späterem Event-/Retryeffekt; Missing Information bleibt offen und derselbe Need wird nicht sofort wiederholt. Der bestehende Eventkatalog hat keinen Skiptyp, weshalb AP-15-02-03-01 noch kein solches Event erzeugt. Assessment/Planner dürfen später Skipstatus aus einem eigenen Collection-/Retryvertrag berücksichtigen.

## 21. Annahmebestätigung

`assumption_confirmed` ist nur gültig, wenn Action, Interaction und Answer an denselben allowlisteten `assumption_key` gebunden sind. Der Wert und seine Property/Entity stammen ausschließlich aus einer versionierten serverseitigen Assumption Rule, niemals aus Kundentext oder Templateparameter. Proposalstatus bleibt `assumed`.

Empfehlung sind zwei Evidence References, weil das bestehende Claimmodell Arrays unterstützt: `system_rule`/Actor `system` für Ursprung und Wert der Annahme; `customer_message`/Actor `customer` für die ausdrückliche Zustimmung. Beide sind opaque und aktiv. Owner muss freigeben, ob die heutige Actor-Klasse `system` semantisch zur `system_rule`-Evidence genügt.

`assumption_rejected`, `unknown` und `deferred` erzeugen keinen Assumption Claim. Rejection ist beantwortete Interaktion, lässt die Information offen und verlangt Alternative/Replan; Unknown lässt Annahme und Wert offen; Deferred verschiebt die Sammlung ohne Wert. Kein Outcome darf still einen Default aktivieren.

## 22. Site Check

Ein Site-Check-Proposal wäre `value_type: unknown`, `value: null`, `epistemic_status: requires_site_check`, Property/Entity aus einer kontrollierten Rule, Evidence `system_rule` oder bei tatsächlicher manueller Entscheidung `manual_entry`. Es ist ein sichtbarer Prüfpunkt, kein technischer Wert.

`mark_requires_site_check` benötigt keine Kundenantwort. Deshalb gehört es in einen separaten `applyNonQuestionPlannerAction`-Prozess und nicht in `mapNormalizedCustomerAnswer`. Beide Pfade in AP-15-02-03-01 zu implementieren wäre zu breit. Der Customer Mapper darf höchstens einen Kundenhinweis referenzieren, aber keinen System-Action-Claim erzeugen.

## 23. Widersprüche

Variante A „immer supersede“ vernichtet die offene Wahrheitssituation. B hält immer parallel, C erlaubt Supersession nur nach expliziter Korrektur, D hält normale neue Angaben parallel. **Empfehlung: D plus C.** Eine normale abweichende Antwort erzeugt einen parallelen `reported` Claim; `findContradictions` diagnostiziert die effektiven unvereinbaren Claims. Eine explizite Klärungs-/Correction-Aktion darf den exakt benannten Vorgänger supersedieren.

Die heutige `SelectedNextAction` enthält Reason Code `contradiction_requires_clarification`, aber keinen geschlossenen `interpretation_mode`, keine `corrects_claim_id` und keinen Supersessionauftrag. Reason Code allein ist als Sicherheitsgrenze zu schwach. Vor automatischer Correction braucht der Plannervertrag ein servergebundenes Feld wie `answer_intent: ordinary | explicit_correction` plus konkreten `target_claim_id`; dies ist ein Owner-/Folgepaket, keine Änderung dieses Audits. Safety-Widerspruch oder Reviewer-Vorgänger führt immer Human Review.

## 24. Supersession

| Situation | Regel |
|---|---|
| gleiche Answer-ID | idempotent, kein zweiter Claim |
| anderer Answer-ID, semantisch gleicher Wert | fachliches Duplikat; standardmäßig kein weiterer Claim, aber nicht mit Transportduplikat verwechseln |
| anderer Wert, normaler Kontext | paralleler Claim; Konflikt sichtbar |
| anderer Wert, expliziter Correction Context | gebundenen Vorgänger append-only supersedieren |
| Unknown nach bekanntem Wert | bekannten Wert nicht supersedieren |
| bekannter Wert nach Unknown | Unknown supersedieren |
| reale Angabe nach `assumed` | Annahme supersedieren, wenn Entity/Property exakt passen |
| Vor-Ort-Befund nach Site Check | eigener Field-Visit-/Reviewerpfad supersediert den Prüfpunkt |

Geschlossene Reason Codes: `explicit_customer_correction`, `unknown_replaced_by_reported_value`, `assumption_replaced_by_reported_value`, `site_check_resolved_by_field_visit`, `reviewer_correction`, `duplicate_value_no_change`. `reviewer_correction` und Field Visit sind für den Customer Mapper nicht auswählbar. Originalclaim und Evidence bleiben erhalten.

## 25. Idempotenz und Duplicate Answers

Empfehlung: Idempotency Key `conversation_id + decision_id + answer_id`. `answer_id` allein könnte systemweit eindeutig sein, doch die zusammengesetzte Bindung verhindert Cross-Conversation-/Decision-Fehlzuordnung und dokumentiert den Vertrag. Text, Hash des Texts, Property/Wert oder Message-Zeit sind ungeeignet.

- `duplicate_answer`: dieselbe Answer-Bindung wurde erneut empfangen, aber noch nicht eindeutig als bereits angewandt bestätigt.
- `duplicate_mapping`: identisches Interpretation-Proposal wurde erneut berechnet.
- `mapping_already_applied`/`already_applied`: Apply erkennt den gespeicherten Schlüssel.
- `idempotent_success`: externes Ergebnis eines bereits vollständig angewandten identischen Proposals; keine zweite Mutation.

Gleicher fachlicher Wert auf eine neue Decision/Answer-ID ist kein Transportduplikat. Ob er als `duplicate_value_no_change` keinen neuen Claim erzeugt, ist eine separate fachliche Regel.

## 26. Stale und Late Answers

Spätere Rebase-Varianten könnten unveränderte Properties anwenden; sie benötigen jedoch Entityhistorie, Frage-Lifecycle, Reviewer-Priorität und Contractkompatibilität. **Sichere MVP-Regel:** Jedes `current_state_version !== selected_action.based_on_state_version` ist `state_version_mismatch`, ohne Claim/Retry/Event/Mutation, mit Replanning; bei Revieweränderung oder Safety Human Review. Supersedierte Frage, veraltetes Template/Contract, ungültige Entity oder Decision-Mismatch werden ebenfalls abgelehnt.

„Late“ ist nur eine Zeitbeschreibung und wird nicht anhand willkürlicher Zeitlimits verworfen. Es gilt die Bindungs-/Versionregel. Eine spätere intelligente Rebase-Logik braucht ein separates Audit.

## 27. State Transition Proposal

Empfohlener unveränderlicher Vertrag:

```text
StateTransitionProposal {
  transition_id, interpretation_id, idempotency_key,
  project_id, conversation_id, based_on_state_version, answer_id,
  transition_type,
  evidence_proposals[], claim_proposals[], superseded_claim_ids[],
  event_proposals[], retry_effect,
  explanation_codes[], created_at
}
```

Geschlossene Typen: `claim_created`, `claim_superseded`, `unknown_recorded`, `skip_recorded`, `assumption_confirmed`, `assumption_rejected`, `no_state_change`, `requires_human_review`. Proposalarrays sind leer oder vollständig gebunden; keine halben Erfolge. `event_proposals` und `retry_effect` dürfen in AP-15-02-03-01 nur deklarative `none`/Absichten sein, nicht angewandt werden.

Zweistufigkeit ist verbindliche Empfehlung: Interpretation validiert und erklärt; Apply prüft aktuelle Version, Idempotenz, Entity und Reviewerstatus nochmals und führt atomar aus. Mehrere Claims/Supersessions benötigen vor Implementierung einen Batch-/Versionsvertrag, weil heutiges `addClaim` pro Claim inkrementiert.

## 28. Conversation Events

Bestehende `knowledge_claim_recorded` und `knowledge_claim_superseded` reichen später für angewandte Claimänderungen, aber nicht für Interpretation, Unknown ohne eigenen Claim, Skip oder Annahme-Rejection. Kandidaten `customer_answer_interpreted`, `assumption_confirmed`, `answer_skipped`, `unknown_recorded` sind erst nach Event-Semantik-/Payloadentscheidung zu ergänzen. Keine Duplikation, falls `customer_message_received` plus Claimevent genügt.

Eventpayloads dürfen nur IDs, kontrollierte Result Codes und maßgebliche State-Version enthalten: Answer-/Decision-/Claim-/Transition-ID; kein Rohwert, Text oder PII. AP-15-02-03-01 erzeugt keine Conversation Events; AP-15-02-03-03 auditiert/implementiert die schmale Ergänzung und atomare Reihenfolge.

## 29. Retry-State-Grenze

Geplante semantische Zuordnung, noch ohne Mutation:

| Answer Outcome | bestehendes Retry Outcome | Information offen? | Empfehlung |
|---|---|---:|---|
| `answered` | `answered` | abhängig vom akzeptierten Claim/Konflikt | erst nach erfolgreichem Apply setzen |
| `unknown` | `unknown` | ja | separater Effekt, auch bei Unknown Claim |
| `skipped` | `skipped` | ja | kein sofortiges Wiederfragen |
| normalisierungs-`invalid` | `invalid` | ja | vor Interpretation abfangen |
| `assumption_confirmed` | `answered` | durch assumed Claim eingeschränkt | MVP-Näherung; eigener Outcome wäre klarer Owner Gate |
| `assumption_rejected` | `answered` | ja | Interaktion beantwortet, Information nicht; Planner muss dies unterscheiden können |
| `deferred` | `superseded`/`skipped` beide semantisch falsch | ja | neuen `deferred`-Retrywert separat freigeben; bis dahin kein Mapping erzwingen |

`ignored` bleibt für nicht angewandte/irrelevante Antworten, `superseded` für ersetzte Versuche. Der heutige Retrykatalog enthält kein `deferred` oder `assumption_rejected`; AP-15-02-03-03 muss dies entscheiden. Retry wird erst mit erfolgreichem Transition Apply atomar aktualisiert, niemals im Mapper.

## 30. Readiness-/Planner-Orchestrierung

Spätere Reihenfolge:

1. Eingang/Answer-ID und serverseitige Source Binding sichern.
2. Normalisierung gegen die gebundene Interaction.
3. Interpretation gegen aktuelle State-Version zu einem Proposal.
4. Proposal unmittelbar vor Anwendung erneut validieren; Idempotenz und CAS prüfen.
5. Claims/Evidence/Supersession und später Retry/Events atomar anwenden.
6. autoritativen neuen State lesen.
7. Missing Information neu ableiten.
8. Readiness neu berechnen.
9. neues versionsgleiches Intermediate Assessment erstellen.
10. Planner mit neuem State/Assessment/Retry ausführen.
11. genau eine Action rendern oder kontrolliert stoppen.

Der Mapper verändert keine Readiness, erstellt kein Assessment, wählt keine Frage und rendert keine Nachricht. Readiness auf alter Version wird verworfen und neu berechnet.

## 31. Human Review

Pflicht bei fehlender/inkonsistenter Rule, unklarer Entitybindung, nicht verlustfreiem Range/Approximation-Wert, nicht allowlistbarem Text, stale State mit Reviewer-/Safetybezug, Widerspruch zu Reviewer-Korrektur, sicherheitskritischem Konflikt, inkonsistentem Assumption Key, unbekanntem Outcome, möglichem Gefahrensachverhalt oder nicht erlaubter Supersession. Generische technische Bindungsfehler werden fail closed und replanned; `requires_human_review` wird zusätzlich gesetzt, wo fachliche Auflösung nötig ist.

Reviewer-Korrekturclaims erkennt der Apply-Pfad über Evidence `reviewer_correction` beziehungsweise gebundene Korrekturbeziehung; normale Kunden-Proposals dürfen sie weder supersedieren noch entwerten. Keine KI ist Reviewer. Human Review ist keine technische/finale Angebotsfreigabe.

## 32. Erklärbarkeit

`MappingExplanation` enthält ausschließlich geschlossene Referenzen/Codes: Rule-ID/-Version, Information-/Property-Key, Entitytyp/-ID, Answer Outcome, Value-Mapping-Code (nicht Rohwert in Logs), epistemischen Status, Evidence Source Type, Conflict-/Supersession-Policy, `based_on_state_version`, Transition-/Result Code und Reviewflag. Keine freie Chain-of-Thought, Modellgedanken, Nachricht, Rohantwort, Kontakt-/Providerdaten oder frei formulierte Fehlermeldung.

## 33. Fehlercodes

Alle Ergebnisse verwenden eine geschlossene Allowlist. `retryable` meint erneute technische Verarbeitung desselben Inputs; `requires_replanning` neue aktuelle Decision; `requires_human_review` fachliche Prüfung; `causes_state_change` ist bei Fehlern immer `false`.

| Code | retryable | replan | review | Stateänderung |
|---|:---:|:---:|:---:|:---:|
| `invalid_interpretation_context` | nein | ja | nein | nein |
| `project_mismatch` / `conversation_mismatch` | nein | nein | ja | nein |
| `state_version_mismatch` | nein | ja | bei Reviewer/Safety | nein |
| `decision_mismatch` / `template_binding_mismatch` / `answer_binding_mismatch` | nein | ja | nein | nein |
| `mapping_rule_not_found` | nein | nein | ja | nein |
| `information_property_mismatch` | nein | nein | ja | nein |
| `entity_type_mismatch` / `entity_id_mismatch` / `entity_not_found` | nein | ja | ja | nein |
| `answer_value_type_mismatch` / `unsupported_answer_outcome` | nein | ja | ja | nein |
| `unsupported_text_mapping` / `numeric_range_not_supported` | nein | ja | ja | nein |
| `assumption_key_missing` / `assumption_not_allowed` | nein | ja | ja | nein |
| `evidence_binding_invalid` | technisch ggf. ja | nein | bei Wiederholung | nein |
| `duplicate_answer` / `mapping_already_applied` | nein | nein | nein | nein; als `idempotent_success` behandelbar |
| `contradiction_requires_review` / `supersession_not_allowed` | nein | ja | ja | nein |
| `human_review_required` | nein | nein | ja | nein |
| `interpretation_failed` | technisch einmal | danach ja | bei Wiederholung | nein |

Freie Detailtexte sind nur intern redigierte Darstellung eines Codes, nicht Vertragsbestandteil.

## 34. Race Conditions

| Fall | gültige Version/Interpretation | Mutation/Idempotenz | Replan/Review/sichtbares Verhalten |
|---|---|---|---|
| A Zwei Antworten auf dieselbe Frage | nur erste bei aktueller Version anwendbar | erste CAS; zweite stale, außer identische ID = idempotent | Replan; zweite nicht als Wahrheit darstellen, Konflikt ggf. Review |
| B doppelter Webhook | gleicher Composite-Key | genau ein Apply, danach `idempotent_success` | kein doppelter Text/Claim |
| C alte Frage | Decision/State alt | keine Mutation | Replan; neutral neue aktuelle Frage/Review |
| D Antwort während Update | Proposalversion verliert CAS | keine Teilmutation | State neu lesen/replan; kein automatisches Rebase |
| E Reviewer korrigiert vorher | Version und Priorität geändert | Customer Proposal abweisen | Human Review; Reviewerwert sichtbar geschützt |
| F Planner hat neue Frage erzeugt | alte aktive Frage superseded | keine Mutation | aktuellen Plannerstand verwenden; ggf. neutral hinweisen |
| G Annahmebestätigung + reale Angabe | genau eine gewinnt CAS | zweite stale; nicht parallel blind anwenden | reale Angabe bevorzugt nur nach neuem kontrollierten Mapping; ggf. Review |
| H Unknown + Wert | erste gewinnt; zweite stale | kein Lost Update | Replan; Wert kann danach Unknown kontrolliert supersedieren |
| I zwei widersprüchliche Werte | erste gewinnt; zweite stale | zweite erst neue Decision; dann parallel, nicht overwrite | Konflikt sichtbar/Human Review bei Safety |
| J Readiness auf altem State | Versionsbindung ungültig | Ergebnis verwerfen | neu ableiten, nichts Altes anzeigen |
| K Entity gelöscht/ungültig | Entity-Snapshot ungültig | keine Mutation | Replan/Human Review, keine Fallbackentity |
| L Conversation pausiert, Antwort später | Pause/Lifecycle serverseitig prüfen; meist Decision stale | keine automatische Mutation | kontrolliert wiederaufnehmen/replan; bei Unklarheit Review |

In allen Fällen wird Idempotenz vor und State-Version unmittelbar bei Apply geprüft. Kein sichtbarer Erfolg vor Commit; kein Plannerlauf auf einem nur vorgeschlagenen State.

## 35. Datenschutz

Claims enthalten nur notwendige strukturierte Fachwerte. Evidence referenziert eine opaque UUID. Proposals, Events, Audit und technische Logs duplizieren keine vollständige Nachricht, Telefonnummer, E-Mail, Adresse, URL, Token, Datei, Bildinhalt, Signed URL oder Providerrohdaten. Freitext ist nur bei freigegebener Notwendigkeit, kanonischer Allowlist und enger Länge zulässig; andernfalls kein Claim. IDs sind intern, Zugriffs-/Retentionregeln folgen einem eigenen Persistenzaudit. Das Dokument trifft keine rechtliche Abschlusseinschätzung.

## 36. MVP-Abgrenzung

Der ursprünglich kombinierte Scope ist noch zu breit, insbesondere Annahmen, Approximation, Events/Retry und State Apply. Empfohlene Teilung:

- **AP-15-02-03-01 Interpretation Registry and Claim Proposals:** Context-/Bindingprüfung, statische Rules für eindeutige Booleanwerte und exact Einzelzahlen, Evidence-/Claim-/Transition-Proposals, Unknown Claim, Skip als No-Claim, keine direkte Mutation. Text nur nach Owner-Allowlist; Approximation/Range fail closed. Annahme nur nach freigegebenem Assumption-Rule-Vertrag.
- **AP-15-02-03-02 State Transition Application:** CAS, Idempotenz, atomare append-only Apply-/Batchversionsregeln, Supersession und Reviewer-Schutz; weiterhin keine Persistenz, sofern als pure Domainbaseline geschnitten.
- **AP-15-02-03-03 Conversation Event and Retry-State Application:** Eventkatalog/-payload, Retryoutcomes einschließlich Deferred/Rejection und atomare Anwendung/Orchestrierungsgrenze.

Site-Check-Systemaktionen gehören in ein eigenes Non-Question-Action-Paket. Keine freie Textklassifikation, Bereiche, Conversation-Orchestrierung oder Persistenz in 03-01.

## 37. Referenzfälle

| Fall | geplantes Ergebnis |
|---|---|
| A `room_area_sqm`, exact 25 | `reported` Number Claim Proposal, Customer-Message-Evidence |
| B approximate 25 | fachlich `reported`, aber bis Approximation verlustfrei modelliert ist Human Review/Owner Gate |
| C Range 20–30 | `numeric_range_not_supported`; kein Mitteln, kein Claim |
| D `indoor_unit_position_known = true` | `room`/Boolean true/`reported` |
| E `outdoor_unit_position_known = false` | `installation`/Boolean false/`reported`; nur Kenntnis verneint |
| F room_type „Wohnzimmer“ | nur bei freigegebener kanonischer Allowlist; sonst `unsupported_text_mapping` |
| G Unknown Raumgröße | `unknown`/null Claim Proposal; Missing bleibt offen; Retryeffekt separat |
| H Skip Gebäudeart | kein Property Claim; No-State-Change/Skip-Absicht |
| I Annahme Raumgröße bestätigt | serverseitiger Wert, `assumed`, System-Rule- plus Customer-Message-Evidence; erst nach Gates |
| J Annahme abgelehnt | kein Claim; offen und Replan |
| K neuer abweichender Wert | parallel; Supersession nur mit explizitem gebundenem Correction Context |
| L Wert nach Unknown | neuer Wert supersediert Unknown append-only |
| M Wert nach Annahme | `reported` Wert supersediert `assumed` Claim |
| N gleiche Answer-ID | `idempotent_success`, keine zweite Mutation |
| O stale State-Version | fail closed, Replan; bei Reviewer/Safety Review |
| P Rule fehlt | keine Mutation, Human Review |
| Q falsche Entity-ID | abgelehnt, kein Fallback |
| R Reviewer-Korrektur vorhanden | keine automatische Überschreibung; Human Review |

## 38. Ownerentscheidungen

Empfehlungen sind keine Implementierungsfreigabe. Durch Produktprinzipien bereits festgelegte Punkte sind als verbindlich markiert; andere bleiben offen.

| # | Entscheidung | Empfehlung | Status |
|---:|---|---|---|
| 1 | Kundenangaben `reported`? | ja, nie automatisch `confirmed` | verbindlich |
| 2 | ungefähr ebenfalls `reported`? | ja; `estimated` für fachliche/systemische Schätzung reservieren | offen |
| 3 | Approximation bewahren? | explizites typisiertes Claim-Metadatum/Value-Modell, nicht Evidence/Status missbrauchen | offen; Schema-Gate |
| 4 | Zahlenbereiche unterstützt? | heute nein | durch Ist-Modell geklärt |
| 5 | Mittelpunkt? | niemals ohne neuen fachlichen Prozess; im MVP nein | verbindlich aus Verlustfreiheit |
| 6 | Raumtyp-Allowlist? | kleine ownergeprüfte kanonische Allowlist; bis dahin kein Mapping | offen |
| 7 | Gebäude-Allowlist? | ebenso | offen |
| 8 | Unknown Claim? | ja, null/`unknown`, plus separater Retryeffekt | offen; Readiness-Gate |
| 9 | Skip Claim? | nein | verbindlich aus Nicht-Wert-Prinzip |
| 10 | Customer Evidence? | persistierte `message_id`; Answer-ID für Idempotenz | offen |
| 11 | Annahme zwei Evidenzen? | ja, `system_rule` + `customer_message` | offen |
| 12 | Confirmation sofort Proposal? | ja, erst nach Assumption-Registry-Freigabe; nie direkt Apply | offen |
| 13 | Site Checks gleiches Paket? | nein, separater System-Action-Pfad | offen |
| 14 | wann supersede? | nur Unknown/Assumption-Ablösung oder explizit gebundene Correction | offen |
| 15 | wann parallel? | normale widersprüchliche neue Angabe | offen |
| 16 | alte Fragen? | MVP fail closed/replan | offen |
| 17 | State mismatch immer fail closed? | ja im MVP | offen |
| 18 | Idempotenzbindung? | Conversation + Decision + Answer | offen |
| 19 | Events in 03-01? | nein; erst 03-03 | offen |
| 20 | Retry gleichzeitig? | nicht interpretieren; erst atomar beim Apply/03-03 | offen |
| 21 | zunächst Transition Proposal? | ja | offen |
| 22 | direkte Mappermutation? | nein | verbindlich empfohlene Sicherheitsgrenze, Ownerfreigabe ausstehend |
| 23 | Reviewfälle? | Katalog aus Abschnitt 31 | offen in Detailklassifizierung |
| 24 | Reviewer-Korrektur schützen? | Actor/Evidence/targetgebunden, nie Customer-Supersession | verbindlich aus Produktprinzip |

## 39. Teststrategie

In diesem Audit wurden keine Tests implementiert oder ausgeführt. Spätere Vitest-Strategie:

- **Binding:** Projekt, Conversation, State-Version, Decision, Template-Key/-Version, Answer-ID, Message-Quelle, Entity und Retry-Key; jede Abweichung fail closed.
- **Registry:** eindeutige Rules, explizite Information-/Property-/Entity-/Answerbindung, fehlende Rule, tiefe Immutabilität, keine Runtime-Registrierung.
- **Boolean:** true/false/unknown; false bleibt false und ist nicht Unknown.
- **Numbers:** exact/approximate/range, Einheit/Precision; kein Mittelpunkt und kein Metadatenverlust.
- **Text:** freigegebene kanonische Werte/Aliase, unbekannter Text, Längenlimit, keine LLM-Deutung.
- **Unknown/Skip:** Unknown Claim und spätere Supersession gemäß Ownerentscheidung; Skip nie als Wertclaim; Missing-/Retry-/Eventgrenze.
- **Assumptions:** confirm/reject/unknown/defer, Key/Rule, beide Evidencequellen, `assumed`, kein Customerwert.
- **Contradictions:** gleicher/anderer Wert, ordinary/correction Context, Reviewer-/Safetykonflikt.
- **Supersession:** Unknown→Wert, Assumption→Wert, explizite Correction; Ursprung bleibt.
- **Idempotenz:** gleiche Answer-ID, Webhookrepeat, neue Decision mit gleichem Wert, bereits angewandtes Proposal.
- **Stale:** alte Version/Frage/Template, ungültige/gelöschte Entity, Revieweränderung, pausierte Conversation.
- **Architecture:** pure/deterministisch/immutable; keine UI, Persistenz, Supabase, KI, WhatsApp, Foto, Preis, externe Dependency oder `package.json`-Änderung.

## 40. Production Gates

1. Ownerentscheidungen 1–24 dokumentiert freigegeben.
2. Text-Allowlist/Aliase und Assumption Rules fachlich versioniert; kein Templatebeispiel als Registryquelle.
3. Approximation verlustfrei entschieden; Range bleibt abgewiesen oder erhält eigenes auditiertes Modell.
4. Unknown-Semantik in Missing Information/Readiness korrigiert und getestet.
5. Entity-Snapshot/Projektzugehörigkeit/Soft Delete vor Apply verifizierbar.
6. Composite-Idempotenz und CAS/Batch-State-Versionierung spezifiziert und getestet.
7. Explicit-Correction-Vertrag bindet Vorgängerclaim; Reviewer-/Safetypriorität geschützt.
8. Evidence Source Binding, Retention, Auth, Persistenz, RLS/Grants separat auditiert.
9. Events und Retryoutcomes inklusive Deferred/Rejection freigegeben und atomar angewandt.
10. Human-Review-Prozess existiert; keine KI oder automatische Freigabe ersetzt ihn.
11. Readiness/Assessment/Planner verwenden exakt die committed neue Version.
12. PII-/Logging-/Auditgrenzen und Replay-/Race-Fälle sind nachgewiesen.
13. Keine produktive Kommunikation, WhatsApp-, Foto-, Preis- oder Angebotslogik vor ihren Gates.

## 41. Folgepakete

| Paket | Inhalt | Ausschluss |
|---|---|---|
| AP-15-02-03-01 | Interpretation Registry and Claim Proposals | State-/Retry-/Event-Mutation, Persistenz, freie Texte/Ranges |
| AP-15-02-03-02 | State Transition Application | Conversation-Orchestrierung/Persistenz ohne eigenes Audit |
| AP-15-02-03-03 | Conversation Events and Retry-State Application | UI/Kanal/Angebot |
| separates Paket | Non-Question Planner Action Application/Site Check | Customer-Answer-Mapping |
| separates Audit | Persistenz, RLS, Retention, Idempotenztransaktion | beiläufige DB-Änderung |
| separates Audit | stale/late Rebase und Conversation Lifecycle | MVP-Fail-closed aufweichen |
| AP-15-03 ff. | Photo Planner, Simulator, Knowledge Extraction, LLM/Vision, WhatsApp | technische/finale Freigabe |

## 42. Kleinstes nächstes Paket

**AP-15-02-03-01 — Interpretation Registry and Claim Proposals**, ausschließlich nach Ownerentscheidung. Minimal: statische Rule-Typen/Registry, immutable Context, transitive Bindungsprüfung, eindeutige Boolean- und exact-Number-Mappings, Customer-Message-Evidence-Proposal, `reported` Claim Proposal, Unknown-Proposal gemäß Gate, Skip ohne Claim, strukturiertes Transition Proposal und Errors/Explanation. Keine direkte State-/Retry-/Event-Mutation, Range, freie Textklassifikation, Site-Check-Systemaktion, Orchestrierung oder Persistenz. Annahmebestätigung wird bei ungeklärtem Rule-/Evidencevertrag besser als eigener kleiner Nachsatz zurückgestellt.

## 43. Status

- **AP-15-01 CONVERSATION DOMAIN BASELINE — IMPLEMENTED**
- **AP-15-02-01 CONTROLLED QUESTION PLANNER — IMPLEMENTED**
- **AP-15-02-02-01 QUESTION TEMPLATE REGISTRY — IMPLEMENTED**
- **AP-15-02-02-02 ANSWER NORMALIZATION — IMPLEMENTED**
- **ANSWER INTERPRETATION — NOT IMPLEMENTED**
- **KNOWLEDGE CLAIM MAPPING — NOT IMPLEMENTED**
- **KNOWLEDGE STATE TRANSITION — NOT IMPLEMENTED**
- **CONVERSATION ORCHESTRATION — NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER — NOT IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR — NOT IMPLEMENTED**
- **AI ANALYSIS — NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION — NOT IMPLEMENTED**
- **OFFER GENERATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**

**Auditstatus: READY FOR OWNER DECISION.** Ausdrücklich nicht `APPROVED FOR IMPLEMENTATION` und nicht Production Ready.

## 44. Scope-Bestätigung

Dieses Paket enthält ausschließlich diese neue Auditdatei und damit ausschließlich Audit, Analyse, Domainplanung, Sicherheitsplanung und Dokumentation. Es enthält ausdrücklich:

- keine Implementierung, Domain-TypeScript-Datei oder Mapping Registry im Code;
- keine Claim- oder Evidence-Erzeugung und keine Knowledge-State- oder Retry-State-Mutation;
- keine Conversation Events, Orchestrierung, UI, Route, Server Action, Service oder Simulator;
- keine Persistenz, Migration, SQL, RPC, RLS-/Grant-Änderung oder Supabase-Nutzung;
- keine KI-, LLM-, Vision- oder WhatsApp-Integration, keine produktiven Prompts und keine Bildverarbeitung;
- keine Preis-/Angebotslogik, Angebotsgenerierung oder automatische technische/finale Freigabe;
- keine Tests, Teständerungen oder Ausführung von Anwendungstests;
- keine externe Abhängigkeit und keine `package.json`-Änderung;
- keine echten Kunden- oder personenbezogenen Daten.

Alle Strukturen, Funktionsnamen, Tabellen, Codes und Abläufe sind nicht ausführbare Architekturvorschläge. Der nächste Schritt ist eine dokumentierte Ownerentscheidung, nicht Implementierungs- oder Produktionsfreigabe.

## AP-15-02-03-01 Interpretation Registry and Claim Proposals Result

### Ergebnis und Ownerentscheidungen

Das Paket implementiert ausschließlich pure, deterministische Interpretation bereits normalisierter Kundenantworten. Direkte und ungefähre Kundenwerte bleiben `reported`; die Approximation wird separat als `exact` oder `approximate` erhalten. Zahlenbereiche werden weder gemittelt noch als Claim vorgeschlagen, sondern mit `numeric_range_not_supported` zur menschlichen Prüfung gegeben. Booleanwerte einschließlich `false` werden als Kundenangabe gemappt. Insbesondere bedeutet `outdoor_unit_position_known = false` nur, dass der Kunde keine konkrete Position kennt; daraus folgen weder technische Nichtexistenz noch Eignung oder Freigabe.

`unknown` erzeugt einen Null-Claim-Vorschlag mit Status `unknown`. Die minimale Regression in `deriveMissingInformation` behandelt einen solchen Claim weiterhin als offen. `skipped` erzeugt keine fachliche Evidence und keinen Property Claim. Freitext für `room_type` und `building_type` bleibt ohne Klassifikation deferred und führt zu `unsupported_text_mapping`.

### Domainstruktur und Verträge

Die neuen Module trennen geschlossene Types, strikte Zod-Schemas, statische Registry, pure Interpretation und synthetische Fixtures. Öffentliche Verträge werden über den Domain-Index exportiert. Der `InterpretationContext` bindet Interpretation, Projekt, Conversation, State-Version, Knowledge State, ausgewählte Action, gerenderte Interaction, normalisierte Antwort, UUID der Quellnachricht, Customer-Actor, Eingabezeit, Idempotenz und optionale explizite Kundenkorrektur. Er enthält weder Rohtext noch Kontakt- oder Adressdaten noch clientbestimmte epistemische Werte.

Der Idempotenzschlüssel ist deterministisch an `conversation_id:decision_id:answer_id` gebunden. Ein optionaler, geschlossener Anwendungsstatus simuliert rein lokal `duplicate_answer` und `mapping_already_applied`; persistente Duplicate-Erkennung ist ausdrücklich nicht enthalten. `idempotent_success` kennzeichnet gleiche wirksame Werte ohne Stateänderung.

### Registry, Property- und Entitybindung

Die tief eingefrorene Registry enthält explizite Regeln für `room_area_sqm`, `indoor_unit_position_known`, `outdoor_unit_position_known`, `line_route_known`, `electrical_supply_known` und `accessibility_known`; `room_type` und `building_type` sind `deferred`. Jede Regel legt Information Key, Entity Type, AP-15-01 Property Key, normalisierten Kind, epistemischen Status, Unknown-/Skip-/Widerspruchs-/Supersessionstrategie, Evidenzquelle, Annahmefähigkeit und Status fest. Gleichnamigkeit allein erzeugt kein Mapping.

Die Entity-ID stammt ausschließlich aus `selected_action.entity_id`; Entity Type und Projekt-/Conversation-/Decision-/Template-/Answerbindungen werden transitiv geprüft. Das heutige Knowledge-State-Modell besitzt keine separate Entityliste. Deshalb wird keine Entitätsexistenz vorgetäuscht: geprüft werden die Actionbindung und die Projektbindung vorhandener Claims; eine darüber hinausgehende Existenzprüfung bleibt einem späteren, reicheren Kontext vorbehalten.

### Evidence-, Claim- und Transition-Proposals

Normale Antworten schlagen ausschließlich strukturierte Customer-Message-Evidence mit opaque UUID, Customer-Actor, Eingabezeit und aktivem Status vor. Bestätigte Annahmen verwenden den serverseitigen Wert `25 sqm` aus der bestehenden Allowlist-Regel `rough_room_area_for_level_2` und erzeugen genau zwei Evidence Proposals (`system_rule`, `customer_message`). Abgelehnte oder zurückgestellte Annahmen erzeugen keinen Claim.

Knowledge Claim Proposals führen Claim-ID, Projekt-/Entity-/Propertybindung, typisierten Wert, epistemischen Status, Evidence, Basis- und Zielversion, optionale Approximation, optionale Supersessionreferenz und geschlossene Reason Codes. Sie sind keine angewendeten Knowledge Claims. StateTransitionProposals sind streng typisiert und tragen ausschließlich eingegebene IDs/Zeitpunkte, `based_on_state_version`, deterministisches `proposed_state_version`, Retry Outcome und strukturierte Explanation Codes. Stateänderungen schlagen exakt Basisversion plus eins vor; No-Change-Transitionen behalten die Basisversion.

### Widerspruch, Supersession und Reviewer-Schutz

Ein realer Kundenwert kann einen wirksamen `unknown`- oder `assumed`-Claim zur Supersession vorschlagen. Ein ausdrücklich gebundener `explicit_customer_correction`-Kontext darf einen abweichenden normalen Claim supersedieren. Gleiche Werte führen zu `duplicate_no_change`; abweichende normale Kundenangaben bleiben als parallele Claims mit `contradiction_recorded` sichtbar. Claims mit Reviewer-Evidence, Reviewer-Actor oder `manually_corrected` sind geschützt und führen zu `reviewer_correction_protected` sowie menschlicher Prüfung. Originalclaims werden nie verändert.

### Retry, Erklärbarkeit und Fehler

Der deklarative Retry Outcome lautet für Antworten und bestätigte/abgelehnte Annahmen `answered`, für Unknown `unknown` und für Skip/Deferred `skipped`. Es erfolgt keine Retry-State-Mutation. Erklärbarkeit besteht nur aus geschlossenen Codes für angewendete Regel, Kundenangabe, erhaltene Approximation, Unknown, Skip, Serverannahme, Bestätigungsevidence, Unknown-/Assumption-Supersession, Duplikat, parallelen Widerspruch, explizite Korrektur, Reviewer-Schutz und Range-Deferred.

Geschlossene Fehler decken ungültigen Kontext, Projekt, Conversation, State-Version, Decision, Template, Answer, fehlende Registry-/Property-/Entitybindung, Werttyp/Outcome, Text/Range, Annahmen, Evidence, Duplikat/Anwendungsstatus, Widerspruch, Supersession und Reviewer-Schutz ab. Stale State ist fail closed, nicht retryable, verlangt Replanning und erzeugt keine Stateänderung.

### Fixtures, Tests und Grenzen

Synthetische Fixtures und Tests decken exakte/ungefähre Raumgröße, Range, Boolean true/false, deferred Text, Unknown, Skip, Annahme confirm/reject/defer, Wert nach Unknown/Assumption, Duplikat, parallelen Widerspruch, explizite Korrektur, Reviewer-Schutz, stale State sowie Schema-, Registry-, Idempotenz-, Immutability- und Architekturgrenzen ab. Sämtliche Daten sind künstlich. Der produktive Mapper ruft weder `addClaim` noch `supersedeClaim` auf.

Es gibt keine Knowledge-State-Anwendung, Conversation Events, Retry-State-Anwendung, Readiness- oder Planner-Neuberechnung, UI, Route, Action, Persistenz, Migration, SQL/RPC/RLS-Änderung, Supabase-Nutzung, freie Textklassifikation, KI/LLM/Vision, WhatsApp, Preis- oder Angebotslogik und keine neue Abhängigkeit.

### Status

- **ANSWER INTERPRETATION REGISTRY IMPLEMENTED**
- **EVIDENCE AND CLAIM PROPOSALS IMPLEMENTED**
- **UNKNOWN CLAIM PROPOSALS IMPLEMENTED**
- **ASSUMPTION CLAIM PROPOSALS IMPLEMENTED**
- **DETERMINISTIC STATE TRANSITION PROPOSALS IMPLEMENTED**
- **KNOWLEDGE STATE TRANSITION APPLICATION NOT IMPLEMENTED**
- **CONVERSATION EVENT APPLICATION NOT IMPLEMENTED**
- **RETRY STATE APPLICATION NOT IMPLEMENTED**
- **TEXT KNOWLEDGE EXTRACTION NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER NOT IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR NOT IMPLEMENTED**
- **AI ANALYSIS NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION NOT IMPLEMENTED**
- **OFFER GENERATION NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**

Das verbleibende Folgepaket **AP-15-02-03-02** darf diese Proposals später kontrolliert auf den Knowledge State anwenden; diese Anwendung ist nicht Bestandteil dieses Ergebnisses.
