# AP-15-02-00 — Controlled Question Planner: Architecture, Domain and Safety Audit

## 1. Audit-Metadaten

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-06-AP15-02-00-CONTROLLED-QUESTION-PLANNER-V1` |
| Datum | 2026-08-06 |
| Paket | AP-15-02-00 |
| Typ | Audit, Analyse und Dokumentation; keine Implementierung |
| Branch | `codex/audit-ap15-02-controlled-question-planner` |
| Baseline | `c51fa38beaa08d9b0524ea28ce1a01304a69b4ea` (`Merge pull request #88 from laulix-krander/codex/implementiere-gesprachsthema-und-wissensstatus-baseline`) |
| Verbindliche Grundlage | `KG-AUDIT-2026-08-06-AP15-00-CONVERSATION-INTELLIGENCE-ENGINE-V1` und gemergte AP-15-01-Domain |
| Remote | Zum Auditzeitpunkt ist kein Git-Remote konfiguriert; ein Vergleich mit einem Remote-Hauptbranch ist daher nicht möglich. |
| Auditstatus | **READY FOR OWNER DECISION** |
| Freigabestatus | ausdrücklich **nicht** `APPROVED FOR IMPLEMENTATION` und nicht Production Ready |

## 2. Scope

Dieses Paket beschreibt ausschließlich die Zielarchitektur eines kontrollierten, deterministischen Question Planners. Es analysiert Information Needs, kontrollierte Frage- und Aktionskandidaten, Eligibility, diskretes Ranking, Antwortverträge, alternative Pfade, Retry/Skip/Unknown, Site Check, Human Takeover, Stop Conditions, Erklärbarkeit, Versionsbindung und Race Conditions.

Ausgeschlossen sind Implementierung, Domain-TypeScript, UI, Simulator, Route, Server Action, Service, Persistenz, Migration, SQL/RPC/RLS/Grants, Supabase, KI/LLM/Vision, WhatsApp, produktive Frage- oder Fotoformulierungen, Kundenkommunikation, Preis-/Angebotslogik, Tests, Dependencies und `package.json`. Alle DTOs und Werte in diesem Dokument sind illustrative fachliche Vertragsentwürfe, kein Code und keine Freigabe.

## 3. Ausgangslage

AP-15-01 kann aus einem versionierten Knowledge State deterministisch wirksame und ersetzte Claims, Widersprüche, Missing Information, Readiness, erlaubte/verbotene Outputs, Annahmen und Vor-Ort-Punkte ableiten. Noch fehlen Auswahl und Lebenszyklus der nächsten Information beziehungsweise Kundenaktion, Formulierung, Fotoanforderungen, Retry-/Antwortlogik, Dialogfortschritt und Transport.

Das Ziel des späteren Planners lautet: **Welche höchstens eine nächste Kundenaktion reduziert die für das gesetzte Ziel relevante Unsicherheit mit vertretbarer Kundenbelastung am sinnvollsten?** Missing Information ist Eingang, nicht automatisch eine Frage. Der MVP bleibt pure, regelbasiert, provider- und kanalunabhängig und führt weder technische Bestätigung noch Freigabe aus.

## 4. Bestehende AP-15-01-Domain

Die vollständige Prüfung von `lib/domain/**`, `test/**`, `docs/audits/**` und besonders der sieben Conversation-Intelligence-Module sowie `test/conversation-intelligence.test.ts` ergibt folgende verbindliche Anschlussgrenzen:

- `MissingInformation` enthält bereits `information_key`, Entitätsbindung, `importance` (`critical|high|medium|low`), geschlossenen `reason_code`, `blocks_level`, `can_use_assumption` und `can_require_site_check`. Es ist bewusst keine Kundenfrage.
- Property Keys sind nach `project`, `room`, `installation` geschlossen; Planner-Verträge müssen diese Schlüssel und UUID-Entitäten referenzieren, nicht duplizieren oder freie Keys erfinden.
- Readiness umfasst Level 0 bis 5. Level 3 heißt `level_3_preliminary_installation`; Level 4 ist nur `offer_draft_ready`, Level 5 bleibt menschlich. Dimensionen sind `need`, `sizing`, Innen-/Außenposition, Leitungsweg, Kernbohrung, Kondensat, Elektro, Zugänglichkeit und `overall`.
- Dimensionen tragen Status, Blocker, Warnungen, Claim-ID-basierte Annahmen und Site-Check-Keys. Planner-Erklärungen referenzieren diese Ergebnisse, statt eine zweite Readiness-Engine zu bauen.
- Epistemische Status sind geschlossen: `confirmed`, `reported`, `observed`, `estimated`, `assumed`, `unknown`, `not_applicable`, `contradicted`, `requires_site_check`. `reported` ist keine technische Bestätigung.
- Widersprüche werden über Entität, Property Key, mindestens zwei Claim-IDs und geschlossene Diagnosecodes ausgegeben. Der Planner darf keinen Claim nach Aktualität gewinnen lassen.
- Evidence References sind schmal und enthalten keine Inhalte; `system_rule` ist die Quelle für zulässige Annahmen. Supersession ist append-only und versionsgebunden.
- Das Intermediate Assessment trennt Fakten, Angaben, Annahmen, Unknowns, Widersprüche und Site Checks und verbietet Festpreis, finales Angebot, technische Freigabe und menschliche Freigabe.
- Fixtures A–F bilden Level 1 bis 4, einen Raumgrößenwiderspruch und Elektro als Site Check ab. Sie sind synthetische Ausgangspunkte, nicht Planner-Fixtures.

**Auditbefund:** AP-15-01 ist die einzige Quelle für Knowledge-, Missing-Information- und Readiness-Semantik. Ein Planner darf daraus Kandidaten ableiten, aber vorhandene Verträge weder still ändern noch mit parallelen Bedeutungen duplizieren. Auffällig ist, dass die derzeitige Missing-Information-Ableitung global je Property Key aggregiert; ein späterer Multi-Room-Planner benötigt vor Erweiterung eine eigene fachliche Prüfung der entitätsspezifischen Ableitung. Der erste Planner-MVP bleibt deshalb beim synthetischen Ein-Raum-Fall.

## 5. Produktprinzipien

1. Pro Planungsschritt wird höchstens eine primäre Kundenaktion ausgewählt; keine Fragegruppe und keine unkontrollierte Liste.
2. Kandidaten und fachliche Auswahl sind geschlossen und regelbasiert; keine freie generative Auswahl.
3. Ein späteres LLM darf nur eine freigegebene Bedeutung sprachlich wiedergeben und niemals Ziel, Antwortvertrag oder Fallback ändern.
4. Safety- und Machbarkeitsblocker gehen Komfort vor; Widersprüche können fehlende Werte überstimmen.
5. Missing Information rechtfertigt nicht automatisch Kundenkontakt. Evidenz, Annahme, Deferral, Site Check oder Mensch können der richtige Pfad sein.
6. Fragen sind nur zulässig, wenn sie für Ziel-Readiness nützlich und vom Kunden wahrscheinlich beantwortbar sind.
7. `unknown` und `skip` sind normale, unterschiedliche Antworten; beide dürfen keine Schleife erzeugen.
8. Retry ist begrenzt und zweckgebunden. Ein semantisch gleiches Rephrasing zählt als weiterer Attempt.
9. Fotoanforderungen brauchen Zielinformation, Entität, Zweck, kontrollierte Vorlage, Qualität, Alternative und eigenes Limit.
10. Annahmen sind allowlist-basiert, sichtbar, widerrufbar und ersetzen keine Sicherheitsklärung.
11. Ein Site-Check-Punkt ist ein zulässiges Ergebnis und nicht bloß ein Fehler.
12. Der Planner bestätigt keinen technischen Fakt, löst keine finale Freigabe und berechnet keinen Preis.
13. Kundenbelastung ist Ranking- und Stop-Kriterium, aber keine psychologische oder personenbezogene Bewertung.
14. Jede Entscheidung ist reproduzierbar, strukturiert erklärbar und exakt an eine State-Version gebunden.
15. Ein Zwischenstand darf eine weitere Frage ersetzen; er referenziert ein bestehendes, versionsgleiches Intermediate Assessment.

## 6. Begriffsdefinitionen

| Begriff | Definition |
|---|---|
| Information Need | Entitätsgebundener fachlicher Bedarf aus Missing Information, Widerspruch oder Zielregel; noch keine Aktion oder Frage. |
| Question Candidate | Kontrollierter Action Candidate mit kundenseitigem Frage-Aktionstyp, Antwortvertrag und `template_key`, aber ohne fertigen Freitext. |
| Action Candidate | Eine mögliche nächste fachliche Aktion für genau einen Need; kann Kundenfrage, Annahmeangebot, Deferral, Site Check, Mensch, Zwischenstand oder Sammlungsschluss sein. |
| Eligible Candidate | Kandidat, der alle harten Constraints auf derselben State-Version erfüllt und erst danach gerankt werden darf. |
| Ineligible Candidate | Kandidat mit mindestens einem geschlossenen Ausschlusscode; er erhält keinen wirksamen Rankingplatz. |
| Blocking Need | Bedarf, dessen Fehlen das gesetzte Ziel-Level oder einen davor nötigen Output blockiert. |
| Non-Blocking Need | Bedarf, der Genauigkeit verbessert, aber das Ziel nicht verhindert. |
| Safety-Critical Need | Bedarf mit möglicher Personen-, Sach-, Elektro-, Statik-, Brand-, Schall- oder Genehmigungswirkung; niemals automatisch annehmbar. |
| Expected Information Gain | Diskrete, regeldefinierte Klasse des erwarteten fachlichen Unsicherheitsabbaus für das aktuelle Ziel, keine Wahrscheinlichkeit. |
| Customer Effort | Diskrete Belastung aus Antwortkomplexität, benötigter Suche/Messung, Medienanforderung und Wiederholung; keine Personenbewertung. |
| Answerability | Regelbasierte Einschätzung, ob ein typischer Kunde die konkrete Information mit dem vorgesehenen Kanal belastbar liefern kann. |
| Dependency | Geschlossener vorher notwendiger Property-/Statusschlüssel; fehlt er, ist der abhängige Kandidat ineligible. |
| Attempt | Ein tatsächlich präsentierter, einem Need zugeordneter Kundenkontaktversuch; Kandidatenerzeugung allein zählt nicht. |
| Retry | Neuer Attempt für denselben Need nach nicht verwertbarer Antwort; vereinfachte Frage und Kanalalternative zählen mit. |
| Deferral | Bewusste Engine-Entscheidung, einen Need bis Trigger, Zielwechsel oder neue Evidenz zurückzustellen. |
| Skip | Expliziter Kundenwunsch, die Information derzeit nicht zu liefern. |
| Unknown Answer | Kunde kennt die Antwort nicht; anders als Skip fehlendes Wissen statt fehlender Bereitschaft. |
| Assumption Path | Angebot einer konkreten allowlist-basierten Arbeitsannahme; erst Annahme durch den vorgesehenen Akteur erzeugt einen `assumed` Claim mit `system_rule`-Evidenz. |
| Site-Check Path | Klassifikation als remote nicht belastbar feststellbar und Überführung in einen sichtbaren Vor-Ort-Prüfpunkt. |
| Human Takeover | Übergabe an einen Menschen; Planner bleibt ohne automatische Freigabe und erzeugt höchstens eine kontrollierte interne Aufgabe. |
| Stop Condition | Geschlossener Grund, in diesem Lauf keine weitere Kundenfrage auszuwählen; nicht zwingend Gesprächsende. |
| Planner Decision | Unveränderliches Resultat eines Laufs: genau eine ausgewählte Aktion oder ein Stop Result, gebunden an Kontext-/Regel-/State-Version. |
| Planner Explanation | Strukturierte Merkmale der Auswahl und Ablehnung; keine freie Begründung und keine Chain-of-Thought. |
| Stale Decision | Entscheidung, deren `based_on_state_version` vor Nutzung nicht mehr der autoritativen State-Version entspricht. Sie darf nicht gesendet/angewandt werden. |
| Superseded Decision | Historisch gültige Entscheidung, die durch eine explizit referenzierte neuere Planung ersetzt wurde; sie bleibt auditierbar, aber nicht aktiv. |

**Abgrenzung:** Fehlende Information ist ein Need; ausgewählte Kundenfrage ist eine potenziell sichtbare Aktion; interner Prüfpunkt ist eine nicht kundenseitige fachliche Kontrolle; Fotoanforderung ist eine kundenseitige Evidenzaktion; menschliche Aufgabe ist interne Übergabe; Vor-Ort-Prüfpunkt ist ein Assessmentzustand und kann später zu Termin-/Mitarbeiterarbeit führen. Keiner dieser Begriffe ist austauschbar.

## 7. Variantenvergleich

Skala: `++` stark/günstig, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet. Bei Kosten und Komplexität bedeutet `++` niedrig/günstig.

| Kriterium | A feste Key-Reihe | B generatives LLM | C Entscheidungsbaum | D Scoring | E Constraints + Scoring | F autonomer Agent |
|---|---:|---:|---:|---:|---:|---:|
| Reproduzierbarkeit | ++ | -- | ++ | ++ | ++ | -- |
| Sicherheit | 0 | -- | + | 0 | ++ | -- |
| Testbarkeit | ++ | -- | ++ | ++ | ++ | - |
| Wartbarkeit | + | - | - bei Wachstum | + | + | -- |
| Fachlichkeit | - | 0, unkontrolliert | + | + | ++ | 0 |
| Kundenfreundlichkeit | - | + sprachlich | 0 | + | ++ | +, unstabil |
| Sackgassenvermeidung | -- | 0 | 0 | + | ++ | 0 |
| Kosten | ++ | - | + | ++ | + | -- |
| LLM-Unabhängigkeit | ++ | -- | ++ | ++ | ++ | -- |
| Race-Condition-Kontrolle | + | - | + | + | ++ | -- |
| Erklärbarkeit | + | -- | ++ | + | ++ | -- |
| Erweiterbarkeit | - | + | - | + | ++ | +, riskant |
| WhatsApp-Eignung | - | 0 | 0 | + | ++ | - |
| MVP-Komplexität | ++ | + scheinbar | 0 | + | 0/+ reduziert | -- |

- **A** ist billig, verwechselt Missing Information mit Frage und ignoriert Entität, Kontext, Widerspruch, Belastung und Auswege.
- **B** ist weder sicher reproduzierbar noch fachlich kontrolliert; Promptkosten und Drift bleiben. Nicht zulässig.
- **C** erklärt Einzelpfade gut, wächst aber kombinatorisch und wird bei nichtlinearen Claims schwer wartbar.
- **D** rankt flexibel, kann aber einen fachlich verbotenen Kandidaten lediglich „niedrig“ statt unmöglich bewerten.
- **E** trennt harte Sicherheit von graduellem Nutzen und ist in reduzierter Form der beste MVP-Kompromiss.
- **F** erweitert unnötig Aktionsraum und Race-Condition-Fläche; für dieses Produktziel ungeeignet.

**Eindeutige Empfehlung:** Variante E, reduziert auf kontrollierte Kandidatenerzeugung, harte Eligibility, diskrete regelbasierte Merkmale, deterministisches Ranking, stabilen Tie-Break und strukturierte Erklärung. Ein Score darf nie ein Constraint überstimmen.

## 8. Architekturentscheidung

Der spätere pure Planner erhält einen validierten `PlannerContext` und arbeitet in dieser festen Pipeline:

1. State- und Kontextversion prüfen; Zielmodus festlegen.
2. AP-15-01-Missing Information, Readiness, Widersprüche und Assessment referenzieren.
3. Information Needs entitätsgebunden normalisieren; Widerspruchsbedarfe vor fehlenden Werten kennzeichnen.
4. Nur allowlist-basierte Action Candidates aus Domainregeln erzeugen.
5. Harte Eligibility pro Candidate auswerten und Ablehnungen strukturiert behalten.
6. Eligible Candidates in harte Prioritätsklasse einordnen und diskrete Score-Komponenten ableiten.
7. Deterministisch ranken und stabil tie-breaken.
8. Genau eine Aktion oder genau ein Stop Result erzeugen.
9. Vor Verwendung State-Version erneut vergleichen; stale bedeutet verwerfen und neu planen.

Der Planner mutiert keinen Knowledge State. Answer-to-Claim-Konvertierung, Annahmeannahme, Site-Check-Markierung und Persistenz sind nachgelagerte, getrennt autorisierte Vorgänge. Candidate IDs müssen aus stabiler Definition, Entität, Need, Aktion und State-Version deterministisch oder serverseitig eindeutig entstehen; Clients liefern weder IDs mit Autoritätswirkung noch Scores.

## 9. Action Types

Geschlossene Ziel-Allowlist und Paketentscheidung:

| Action Type | Bedeutung | AP-15-02-01 | Sichtbarkeit |
|---|---|---|---|
| `ask_text` | kurze kontrollierte Texteingabe | ja | kundenseitig nach separater Formulierung |
| `ask_yes_no` | kontrolliertes Boolean | ja | kundenseitig |
| `ask_choice` | eine Option aus Allowlist | zurückgestellt auf AP-15-02-02 | kundenseitig |
| `ask_number` | exakter Zahlenwert | zurückgestellt | kundenseitig |
| `ask_approximate_number` | Näherungswert/Intervall | ja | kundenseitig |
| `request_photo` | ein zweckgebundenes Foto | fachlich reserviert, AP-15-03 | kundenseitig |
| `request_multiple_photos` | kontrolliertes Foto-Set | AP-15-03 | kundenseitig |
| `request_document` | konkretes Dokument | späteres separates Audit | kundenseitig |
| `offer_assumption` | konkrete erlaubte Annahme zur Zustimmung | ja | kundenseitig, Annahme selbst noch nicht wirksam |
| `mark_requires_site_check` | Need in Vor-Ort-Pfad geben | ja | **interne Engineaktion**, Ergebnis später erklärbar |
| `defer_information` | Need bewusst zurückstellen | ja als interner Fallback/Stopbestandteil | **nie direkt als technische Aktion sichtbar** |
| `request_human_review` | menschliche Übernahme anfordern | ja als interner Stop/Aktionspfad | **nie roh kundenseitig sichtbar** |
| `present_intermediate_result` | versionsgleiches Assessment auswählen | ja | Referenz intern; Darstellung separat |
| `end_collection` | Sammlung fachlich beenden | zurückgestellt; Stop Result genügt zunächst | **nie roh kundenseitig sichtbar** |

Der erste synthetische MVP benötigt damit primär die sechs empfohlenen Typen sowie interne `defer_information`-/`request_human_review`-Ergebnisse, damit Sackgassen geschlossen bleiben. Diese Erweiterung ist kein automatischer Versand.

## 10. Question Candidate Contract

Illustrativer strikter Vertrag:

```text
QuestionCandidate {
  candidate_id, project_id, conversation_id, based_on_state_version,
  information_key, entity_type, entity_id,
  action_type: ask_text | ask_yes_no | ask_approximate_number,
  answer_contract_ref, priority_class, blocks_level?,
  safety_relevance, feasibility_impact, sizing_impact,
  installation_impact, price_risk_impact, readiness_impact,
  expected_information_gain, answerability, customer_effort,
  retry_state, dependency_keys[], alternative_paths[],
  reason_codes[], template_key, status
}
```

MVP-pflichtig sind Identität/Bindung, State-Version, Need/Entität, Aktion, Antwortvertrag, Prioritätsklasse, Zielwirkung, diskrete Scoringmerkmale, Retry/Dependencies/Fallbacks, geschlossene Reason Codes, Template Key und Eligibilitystatus. `technical_impact` wird nicht zusätzlich geführt, weil Machbarkeit, Sizing und Installation präziser sind. `retry_count`/`max_retries` liegen gemeinsam in `RetryState`. Freie Frage, freie Modellbegründung, LLM-Confidence und clientbestimmte Werte sind verboten.

## 11. Selected Action Contract

```text
SelectedNextAction {
  decision_id, planner_contract_version,
  project_id, conversation_id, based_on_state_version,
  selected_candidate_id, action_type,
  information_key?, entity_type?, entity_id?,
  answer_contract?, fallback_paths[], reason_codes[],
  intermediate_assessment_id?,
  created_at, created_by_actor_class: system
}
```

Der Vertrag ist schmal und unveränderlich. Optionale Need-/Answer-Felder sind nur für Nichtfrageaktionen abwesend. Er enthält weder Scoregesamtwert als Autorität noch Nachrichtentext, Prompt, Kundendaten oder technische Freigabe. `created_by_actor_class` ist im MVP ausschließlich `system`; `ai` wäre ohne AI-Ausführung falsch.

## 12. Eligibility

Eligibility ist eine Konjunktion harter Regeln. Geschlossene MVP-Ineligibility-Codes:

| Code | Ausschluss |
|---|---|
| `state_version_mismatch` | Candidate/Context basiert nicht auf aktuellem State. |
| `project_or_conversation_mismatch` | Bindung passt nicht. |
| `entity_not_found` | Zielentität fehlt im gültigen Kontext. |
| `information_already_sufficient` | Wirksamer Claim genügt für Ziel und Vertrag. |
| `information_not_applicable` | Wirksamer Status ist `not_applicable`. |
| `assumption_already_accepted` | Gültiger `assumed` Claim deckt den Pfad kontrolliert ab. |
| `site_check_already_required` | Need wurde bereits als `requires_site_check` klassifiziert. |
| `retry_limit_reached` | Maximalzahl tatsächlicher Attempts erreicht. |
| `dependency_unsatisfied` | Mindestens eine notwendige Dependency fehlt. |
| `customer_not_answerable` | Regel-/Historienzustand zeigt, dass diese Aktion nicht lieferbar ist. |
| `outside_target_readiness` | Kein sinnvoller Beitrag zum Ziel oder notwendigen Zwischenergebnis. |
| `contradiction_requires_resolution` | Ein vorrangiger Konflikt macht diese normale Frage unzulässig. |
| `critical_contradiction_requires_human` | Konflikt darf nicht kundenseitig gelöst werden. |
| `human_takeover_required` | Kontext verlangt Mensch statt weiterer Kundenaktion. |
| `customer_declined_need` | Aktiver Skip verhindert erneutes Fragen bis definiertem Reopen-Trigger. |
| `information_deferred` | Deferral-Trigger ist noch nicht eingetreten. |
| `action_type_not_allowed` | Typ ist im Planner-/Modusvertrag nicht freigegeben. |
| `answer_contract_unavailable` | Kein kontrollierter Antwortvertrag existiert. |
| `template_unavailable` | Für später sichtbare Frage fehlt kontrollierter Template Key. |

Harte Safetyverbote, State-/Entitätsfehler, maximale Retries, Not-applicable, Human Takeover und fehlende kontrollierte Verträge sind nie Scorefragen. Mehrere Codes dürfen strukturiert festgehalten werden.

## 13. Scoring

Qualitative Klassen: `none`, `low`, `medium`, `high`, `critical`. `critical` ist nur für fachliche Auswirkung, niemals eine Confidence. Eine intern versionierte Mappingtabelle kann Klassen auf kleine ordinale Punkte abbilden; dieses Audit legt bewusst keine produktive Formel fest.

| Komponente | Wirkung | Bemerkung |
|---|---|---|
| `safety_relevance` | positiv/prioritätsprägend | Safetyverbote bleiben Constraints. |
| `feasibility_impact` | positiv | Machbarkeit vor Optimierung. |
| `sizing_impact` | positiv | nur bis zum Zielniveau. |
| `installation_impact` | positiv | besonders für Level 3. |
| `price_risk_impact` | positiv | Risiko reduzieren, niemals Preis berechnen. |
| `readiness_impact` | positiv | nächstes erreichbares Ziel/Dimension. |
| `expected_information_gain` | positiv | regelbasiert, keine Statistikbehauptung. |
| `answerability` | positiv | `none` kann harter Ausschluss sein. |
| `customer_effort` | negativ | niedriger Aufwand gewinnt bei ähnlichem Nutzen. |
| `repetition_penalty` | negativ | steigt diskret je Attempt; Limit bleibt Constraint. |
| `dependency_bonus` | positiv | belohnt freischaltenden, nicht bereits erfüllten Need. |
| `contradiction_bonus` | positiv | nur für zulässige Kläraktion; kritische Konflikte können Mensch erzwingen. |
| `assumption_availability_penalty` | negativ für erneute Frage | wenn sichere Alternative existiert. |
| `site_check_availability_penalty` | negativ für belastende Remote-Frage | Site Check nicht als bequemer Ersatz für leicht beantwortbare Blocker. |

Scoreerklärung speichert pro Komponente Klasse, Regelcode und Richtung, nicht freie Gedanken. Kalibrierung erfolgt später ausschließlich über versionierte Mapping-/Prioritätsregeln, synthetische/fachlich abgenommene Fälle und Änderungshistorie; keine stillen Produktionsgewichte. Historische Entscheidungen binden `planner_contract_version`, damit Replays erklärbar bleiben.

## 14. Prioritätsregeln

Vor dem Score gilt die fachlich geprüfte Reihenfolge von **Bändern**:

1. Human-/Safety-Stop: möglicher Gefahrensachverhalt oder nicht kundenseitig lösbarer sicherheitskritischer Widerspruch.
2. Kundenseitig lösbarer Widerspruch mit Safety- oder Machbarkeitswirkung.
3. Sicherheitskritischer Need, soweit die Kundenaktion sicher und beantwortbar ist; sonst Site Check/Mensch.
4. Machbarkeitsblocker für das Ziel.
5. Blocker des unmittelbar angestrebten Readiness-Levels.
6. Hohe Installation-/Preisrisiko- oder technische Unsicherheitsreduktion innerhalb des Ziels.
7. Genauigkeitsverbesserer.
8. optionale Komfortinformation nur bei freiem Belastungsbudget und erkennbarem Zielnutzen.

Innerhalb desselben Bands entscheidet der diskrete Nutzen. Bei fachlich ähnlichem Nutzen gewinnt geringere Belastung. Tie-Break danach: höherer Readiness-Impact, höhere Answerability, weniger Attempts, stabile Reihenfolge aus geschlossenem `information_key`, `entity_type`, `entity_id`, `action_type`, zuletzt `candidate_id`. Zeitstempel und Eingangsreihenfolge sind kein fachlicher Tie-Break. Unterschiedliche Ergebnisse zweier Runs auf identischem Context/Regelstand sind ein Fehler.

## 15. Ziel-Readiness

Modi werden auf bestehende Level gebunden: `rough_scope` → Level 1, `preliminary_system` → Level 2, `preliminary_installation` → Level 3, `offer_draft` → Level 4, `human_review` → Übergabe/Level 5 ausschließlich menschlich. Der Modus ist serverseitiger Kontext, nicht vom Client als autoritative Freigabe gesetzt.

**Technische MVP-Empfehlung, Ownerentscheidung offen:** fest `preliminary_installation` / `level_3_preliminary_installation`. Es liefert Installationskontext, ohne Level-4-Angebotsnähe, Preis oder Freigabe zu behaupten. Automatischer Moduswechsel aus Freitext ist im MVP verboten. Ein Kundenwunsch nach schnellem Preisrahmen senkt nicht die Sicherheitsgrenzen; mangels Preislogik führt er zu Zwischenstand und gegebenenfalls Mensch.

Sammlung stoppt bei erreichtem Ziel. Ein Zwischenstand ist vorher zulässig bei ausdrücklichem Wunsch, Belastungscap, Pause/Abbruch, nur noch Site Checks, Human Takeover oder fehlenden beantwortbaren Kandidaten. Das Ziel wird niemals still auf Level 4 erhöht.

## 16. Answer Contracts

Ein `AnswerContract` enthält: `answer_type`, kontrollierte erlaubte Werte/Options-IDs, optionale Einheit, fachlich freigegebene Min-/Max-Grenzen, strukturierte Beispiele/Hint-Keys, `unknown_allowed`, `skip_allowed`, geschlossene Validation Codes, alternative Answer-Contract-Refs und eine erlaubte Claim-Conversion-Definition. Keine Parserlogik und kein freier Patch.

| Typ | Vertragliche Grenze | MVP |
|---|---|---|
| `text` | begrenzter normalisierter String; nur für allowlist-basierte semantische Zuordnung | ja |
| `boolean` | ausschließlich wahr/falsch | ja |
| `single_choice` | genau eine serverdefinierte Options-ID | AP-15-02-02 |
| `integer` | ganze Zahl, Einheit/Min/Max | später |
| `decimal` | endliche Dezimalzahl, Einheit/Min/Max | später |
| `approximate_number` | Näherungswert oder kontrolliertes Intervall, z. B. m²; Plausibilitätsgrenzen | ja |
| `measurement` | Zahl plus geschlossene Einheit und Messqualität | später |
| `unknown` | expliziter Antwortzustand, kein Validierungsfehler | ja |
| `skip` | explizite Ablehnung für jetzt | ja |
| `photo` / `multiple_photos` | Media-Referenzen plus Zweck-/Qualitätsvertrag | AP-15-03 |

Validation Codes sollen mindestens `answer_type_mismatch`, `value_out_of_range`, `unit_not_allowed`, `choice_not_allowed`, `empty_answer`, `unknown_not_allowed`, `skip_not_allowed`, `stale_question_reference` umfassen. Konvertierung erzeugt später nur einen neuen evidenzgebundenen Claim nach Property-/Entity-Regeln; `unknown` wird `unknown`, nicht `false` oder `0`; Skip erzeugt keinen erfundenen fachlichen Wert.

## 17. Unknown-Pfad

- Erster `unknown`/erfolgloser Attempt: für denselben Need genau eine einfachere kontrollierte Alternative wählen, sofern sie tatsächlich besser beantwortbar ist; sonst direkt zulässigen Fallback.
- Zweiter erfolgloser Attempt: keine dritte semantisch gleiche Kundenfrage. In Reihenfolge fachlicher Zulässigkeit `offer_assumption`, später zweckgebundenes Foto, `mark_requires_site_check`, Deferral oder `request_human_review`.
- Maximal **zwei Kunden-Attempts pro Information Need** ist die technische MVP-Empfehlung; Ownerfreigabe bleibt nötig. Für Fotoaktionen empfiehlt sich höchstens ein Request plus keine automatische Wiederholung.
- Retry zählt über Templates und Kanäle hinweg pro Need/Entität. Neue unabhängige Evidenz, Entitätswechsel oder fachlich anderer Need kann einen neuen Zustand erzeugen; bloßer Zeitablauf setzt den Zähler nicht zurück.

## 18. Skip und Deferral

| Zustand | Readiness | Neue Candidates | Assessment / Belastung |
|---|---|---|---|
| `unknown` | Need bleibt offen/blockierend gemäß AP-15-01 | vereinfachter/Fallback bis Limit | als Unknown sichtbar; Attempt zählt |
| `skip` | Need bleibt fachlich offen; kein künstlicher Fortschritt | gleiche Frage bis Reopen-Trigger gesperrt; Alternative/Site/Mensch möglich | Kundenentscheidung sichtbar, keine unnötige Wiederholung |
| `deferred` | unverändert; kann Ziel weiterhin blockieren | bis Ziel-/State-/Zeit-/Human-Trigger keine Frage | als bewusst zurückgestellt erklären, Engineentscheidung zählt nicht als Kunden-Attempt |
| `not_applicable` | darf Dimension nach bestehender Readinessregel klassifizieren, nicht als fehlend erfinden | keine Candidate-Erzeugung, außer menschliche Korrektur | begründet und evidenzgebunden sichtbar |
| `requires_site_check` | bestimmte niedrigere Level erlaubt, betroffene höhere Dimension blockiert/markiert | keine Remote-Wiederholungsfrage ohne neue Evidenz/Reopen | Site-Check-Liste sichtbar, Kundenbelastung endet für diesen Need |

Skip braucht einen Reopen-Trigger (Kunde bringt Thema selbst wieder auf, neue Evidenz, Zielwechsel oder menschliche Entscheidung). Deferral braucht einen maschinenlesbaren Trigger; „später“ als freier String genügt nicht.

## 19. Annahmen

`offer_assumption` ist nur zulässig, wenn eine konkrete Regel-ID in einer fachlich freigegebenen Allowlist für Property, Entität, Zielmodus und Kontext passt, kein Safety-/Genehmigungs-/Machbarkeitsverbot besteht, die Annahme dem Kunden sichtbar angeboten wird und Ablehnung/Alternative definiert sind. Erst kontrollierte Annahme erzeugt später `assumed` mit `system_rule`-Evidence, Regelreferenz, Widerrufbarkeit und Supersession durch neue Evidenz. Readinesswirkung muss je Regel begrenzt sein.

**Vorgeschlagene erste MVP-Allowlist, vollständig owner- und fachprüfpflichtig:**

- ungefähre Raumfläche als deutlich gekennzeichnetes Größenband aus einer vom Kunden gewählten groben Raumkategorie; nur für Level 2/3-Eingrenzung, nie exakte Dimensionierung;
- übliche Raumhöhe als kontrollierte Standardannahme nur bei Standardwohnraum und ohne Dach-/Sonderraumhinweis; nicht für finale Leistungsauslegung;
- Gebäudeart aus einer explizit bestätigten, engeren Wohngebäude-Kategorie übernehmen, nicht frei raten;
- Innenposition bleibt „noch nicht festgelegt“ als Planungsannahme, niemals als bestätigte Montageposition.

Nicht automatisch annehmbar sind Elektrofreigabe, finale Außenposition, Genehmigung, Schallschutz, risikorelevantes Wandmaterial, finale Leitungslänge, Tragfähigkeit und finale Kondensatentsorgung. Ebenso darf `line_route_known=false` nicht als bestätigter sicherer Leitungsweg behandelt werden. Wegen fachlicher Risiken sollte AP-15-02-01 zunächst nur Regelverträge/Eligibility und höchstens die Raumflächenband-Annahme als synthetischen Fall enthalten; produktive Allowlist bleibt Gate.

## 20. Site Check

`mark_requires_site_check` darf gewählt werden, wenn der Need remote grundsätzlich nicht belastbar feststellbar ist oder nach höchstens zwei beantwortbaren Versuchen ungelöst bleibt, AP-15-01 den Pfad erlaubt, keine sichere Annahme zulässig ist und der Punkt fachlich vor höherer Aussage geprüft werden muss. Er **muss** gewählt oder an Mensch eskaliert werden bei unbestimmbarer Elektroversorgung, verborgenem Leitungs-/Wandaufbau, genehmigungsrelevanter Fassade, unklarer sicherer Zugänglichkeit, unplausibler Kondensatführung oder nicht bestätigbarer Außenposition.

Der Pfad erzeugt später keinen positiven Fakt, sondern `requires_site_check` mit Evidenz/Regel. Er beendet die Fragefolge für diesen Need, erscheint im Assessment und kann Level 1–3 je nach Dimension weiterhin erlauben. Für Level 4 darf ein Site Check nach heutiger AP-15-01-Regel bestimmte Safety Keys klassifizieren; fachlich bleibt jedoch jede finale technische/Angebotsfreigabe verboten und muss vor Produktion durch Fachowner abgenommen werden. Kritische Gefahren oder Genehmigungsentscheidungen können statt Site Check sofort Mensch erfordern.

## 21. Widersprüche

Der Planner verwendet die AP-15-01-Contradiction samt Claim-Referenzen und wählt nie still den neuesten Wert.

- Kundenseitig klärbar: einfache, nicht sicherheitskritische Angaben, die der Kunde aus eigener Kenntnis eindeutig korrigieren kann, etwa zwei Raumgrößenangaben. Aktion: kontrollierte Clarification über passenden `ask_*`-Typ mit Referenz auf Optionen/Werte, nicht freier Vorwurf.
- Evidenz sinnvoll: sicht- oder dokumentierbare, klar definierte Information; `request_photo`/Dokument erst in freigegebenem Folgepaket.
- Human Review: widersprüchliche Elektro-, Tragfähigkeits-, Genehmigungs-, Schall-, Gefahr- oder fachlich ungewöhnliche Angaben sowie Konflikt nach maximaler Klärung.
- Site Check: physisch/verborgen zu prüfender Konflikt, sofern keine akute Gefahr und Vor-Ort-Prüfung fachlich ausreicht.

Ein Clarification Attempt zählt zum Need-Retry. Solange der Konflikt aktiv ist, sind daraus abhängige normale Fragen ineligible. Neue Evidenz muss einen Claim kontrolliert supersedieren oder Konfliktstatus ändern; bloße Plannerentscheidung löst nichts auf.

## 22. Zwischenergebnis

`present_intermediate_result` ist zulässig, wenn Ziel-Readiness erreicht ist, der Kunde Zwischenstand/Preis verlangt, das Belastungscap erreicht ist, keine beantwortbare Frage verbleibt, nur Site Checks offen sind, Human Takeover nötig ist, Kunde pausiert/abbricht oder erlaubte Annahmen für eine grobe Eingrenzung genügen. Ein Preiswunsch erzeugt mangels Preislogik ausschließlich einen ehrlichen Zwischenstand und gegebenenfalls Mensch.

Die Aktion referenziert `assessment_id` und dieselbe `based_on_state_version`. Sie erzeugt keinen Text, keine neue technische Aussage und keine Freigabe. Ist kein versionsgleiches Assessment vorhanden, muss es in einem getrennten späteren Schritt erzeugt werden; der Planner darf keines erfinden.

## 23. Stop Conditions

Geschlossene MVP-Stop Reasons:

`target_readiness_reached`, `no_eligible_candidate`, `customer_declined`, `customer_unresponsive`, `requires_human_review`, `site_visit_required`, `critical_contradiction`, `collection_paused`, `maximum_customer_effort_reached`.

Ein Stop Result enthält Reason, State-/Kontextversion, zulässige nächste Systemaktion (`present_intermediate_result`, `request_human_review`, `site_visit_required`, `resume_later`, `none`) und strukturierte Referenzen. Stop ist nicht automatisch `end_collection`, Conversation Close oder Projektstatusänderung. `no_eligible_candidate` darf nicht als Erfolg maskiert werden.

## 24. Kundenbelastung

`CustomerEffortState` aggregiert ausschließlich sachliche Interaktionsdaten: aufeinanderfolgende technische Fragen, gesamte Attempts im aktuellen Sammelabschnitt, unbeantwortete Attempts, Retries, Fotoanforderungen, diskrete Antwortkomplexität und aktuelle Readiness. Zeit seit Beginn darf nur als Pause-/Stalenessignal dienen, nicht als psychologisches Profil. Keine Antwortgeschwindigkeit, Stimmung, vermeintliche Kompetenz oder personenbezogene Bewertung wird abgeleitet.

**MVP-Empfehlung, Ownerentscheidung offen:** höchstens vier aufeinanderfolgende technische Fragen, danach `present_intermediate_result` oder kurze kontrollierte Zusammenfassung/Pause; maximal zwei Attempts je Need; Foto separat maximal einmal. Safetygefahr darf den Cap nicht durch weitere Kundenfragen überschreiten, sondern führt zu Mensch/Site Check. Ein Zwischenstand setzt den Abschnittszähler nur nach tatsächlicher neuer Kundenentscheidung oder Resume zurück, nicht als Trick zur Endlossammlung.

## 25. Fotoabgrenzung

`request_photo` ist nur eligible mit genauem Information Key, Entität, fachlichem Zweck, kontrollierter Anweisungsvorlage, Qualitätskriterien, Datenschutz-/Medienvertrag, Alternative bei Nichtverfügbarkeit und Retrylimit. `request_multiple_photos` braucht zusätzlich begrenzte Anzahl und Zweck pro Aufnahme. Ein Foto bestätigt nichts automatisch; es ist Evidence für spätere kontrollierte Beobachtung/Review.

**Entscheidungsempfehlung:** AP-15-03 als separates Photo Request Planner Audit/Paket. AP-15-02-01 darf Action Types und Fallbackreferenzen reservieren, erzeugt aber keine Foto-Candidates oder Anweisungen. Grund sind eigenständige Media-, Qualitäts-, Datenschutz-, Vision- und Belastungsverträge.

## 26. Frageformulierung

Der Planner liefert ausschließlich `template_key` plus kontrollierte Parameter-IDs. Denkbare, noch nicht produktive Schlüssel sind `ask_room_type`, `ask_room_area_approximate`, `ask_building_type`, `ask_indoor_position_known`, `ask_outdoor_position_known`, `ask_line_route_known`, `ask_electrical_supply_known`. AP-15-02-02 definiert später Version, Sprache, Parameterallowlist und semantische Tests.

Ein optionaler späterer LLM-Rewrite wäre eine nachgelagerte serverseitig validierte Darstellung: begrenzte Länge/Sprache, unveränderte Bedeutung, Antwortoptionen, Einheit, Unknown/Skip und Safetyhinweis. Fallback ist immer die kontrollierte Vorlage. Dieses Audit implementiert weder Vorlage noch Text, Prompt oder Rewrite.

## 27. Erklärbarkeit

`PlannerExplanation` enthält: ausgewählte Candidate-ID, begrenzte Top-Rejections, Ineligibility-Codes, diskrete Score-Komponenten samt Regelcodes/Richtung, Zielmodus/-level, `based_on_state_version`, Planner-Vertragsversion, Reason Codes, Customer-Effort-Klassen und RetryState. Reason Codes sind serverseitig geschlossen, beispielsweise `resolves_critical_contradiction`, `blocks_target_level`, `reduces_feasibility_uncertainty`, `reduces_sizing_uncertainty`, `lower_customer_effort`, `fallback_after_unknown`, `assumption_path_available`, `site_check_required`, `target_reached`.

Nicht gespeichert werden vollständige Kundennachrichten, fertige Fragen, PII, Prompts, freie Modellbegründung, Chain-of-Thought oder „Gedanken“. Erklärbarkeit beschreibt Inputs und Regeln, nicht interne Überlegungsprosa.

## 28. Versionierung

- `planner_contract_version` versioniert Kandidaten-, Eligibility-, Prioritäts-, Score- und Tie-Break-Regeln gemeinsam.
- Jede Candidate-/Decision-Bindung enthält `based_on_state_version`; optional bindet der Kontext zusätzlich Assessmentversion und Conversation-Sequence.
- **Stale Detection:** unmittelbar vor Präsentation oder Mutation muss autoritative `state_version === based_on_state_version` gelten. Andernfalls keine Nutzung, sondern Replan.
- **Supersession:** neuere Entscheidung referenziert optional `supersedes_decision_id`; nur eine kann für eine Conversation/State-/Planungsphase aktiv sein.
- **Spätere CAS-Grenze:** Speichern/Aktivieren nur, wenn erwartete State-Version und keine aktive neuere Entscheidung übereinstimmen. Das Audit implementiert keine Persistenz.
- Antworten binden Question/Decision-ID. Eine alte Antwort wird als neue Evidence gegen den aktuellen State validiert, niemals blind auf den alten Candidate angewandt.

## 29. Race Conditions

| Fall | gültige Version / stale | Mutation und Replan | sichtbares Verhalten | Audit-/Telemetriebedarf |
|---|---|---|---|---|
| A Zwei Kundennachrichten gleichzeitig | kanonische Ingestion-Reihenfolge/CAS entscheidet; erste Planung nach überholtem State stale | beide idempotent verarbeiten, Claims seriell versionieren, danach einmal neu planen | keine doppelte Frage | Message-Refs, Reihenfolge, Stateversionen, verworfene Decision-ID |
| B Antwort auf ältere Frage | alte Decision ist superseded; Antwort selbst kann weiterhin Evidenz sein | gegen aktuelle Entität/Need validieren, Claim ggf. neu hinzufügen, replan | nicht erneut fragen, neutrale Bestätigung separat | alte/neue Decision-Ref, Conversionresultat, keine Rohinhalte |
| C Claim entsteht während Planung | Decision-State kleiner als aktueller State → stale | Candidate verwerfen, neuer Lauf | nichts Veraltetes senden | stale code, beide Versionen |
| D Reviewer korrigiert während Planung | Reviewer-Claim erhöht Version | Review gewinnt nicht „inhaltlich automatisch“, aber erzwingt Replan auf neuem State | alte Frage unterdrücken | Actor-Klasse, Claim-/Decision-Refs, Version |
| E Konflikt gelöst, alte Frage wartet | offene Clarification wird stale/superseded | aktive Frage deaktivieren, neu planen | keine unnötige Klärung; alte Antwort dennoch prüfen | Konflikt-/Supersession-Refs |
| F Zwei Runs wählen verschieden | bei identischem Context/Regelstand Determinismusfehler; bei verschiedenen Versionen ältere stale | CAS lässt höchstens eine aktive Decision zu; Diagnose/Replan | genau eine Aktion | Inputhash ohne PII, Regelversion, Rankings, CAS-Ergebnis |
| G Fotoanalyse verspätet | Analyse bezieht sich auf Media/State; laufende Decision kann nach Claim stale werden | Ergebnis erst validiert/reviewt als Claim, dann Replan | keine automatische Bestätigung | Media-/Run-Ref, Analyse-/Stateversion, Reviewstatus |
| H `unknown` plus Bild | beide Events geordnet; unbekannt darf Bild nicht invalidieren | Unknown Attempt zählen, Bild separat prüfen, erst danach Replan | keine sofortige Wiederholungsfrage | Eventreihenfolge, Need, Attempt, Media-Ref |
| I Zwischenstand plus neue Evidenz | Assessment/Action wird bei neuer Version stale; bereits gezeigter Stand bleibt historisch versionsklar | neue Evidenz verarbeiten und neues Assessment/Plan erzeugen | klar als damaliger Zwischenstand, später aktualisieren | Assessment-/Decision-/Stateversionen |
| J Pause und Resume | Pause stoppt Auswahl; Resume nutzt aktuellen State, nie alte aktive Decision | Kontext/Belastungsabschnitt nach Regel reaktivieren, neu planen | keine ungefragte Wiederholung | Pause-/Resume-Eventrefs, Retry bleibt erhalten, Version |

Keine dieser Regeln setzt Provider-, Event- oder Decision-Persistenz in diesem Paket voraus; sie definiert nur spätere CAS-/Audit-Gates.

## 30. Human Takeover

`request_human_review` ist verpflichtend bei sicherheitskritischem, nicht trivial klärbarem Widerspruch; möglichem Gefahrensachverhalt; ungewöhnlicher Installation außerhalb Property-/Regel-Allowlist; unklarer Genehmigung; verbindlichem Preiswunsch; Beschwerde; ausdrücklichem Mitarbeiterwunsch; Aussage außerhalb MVP-Domain; wiederholter erfolgloser Erhebung ohne sicheren Site-Check-/Annahmepfad; oder wenn keine geeignete Kundenaktion verbleibt und der Need relevant blockiert.

Takeover enthält nur geschlossenen Reason Code, Projekt/Conversation/State, betroffene Need-/Claim-Referenzen und Prioritätsklasse. Keine PII oder vollständigen Nachrichten in technischer Telemetrie. Ein Mensch prüft und entscheidet; KI ist kein Reviewer. Takeover ist niemals automatische technische oder Angebotsfreigabe.

## 31. DTO-Grenzen

| DTO | Schmale illustrative Felder |
|---|---|
| `QuestionCandidate` | Candidate-/Scope-/State-Bindung, Need, Frage-Aktion, Answer Ref, Template Key, Merkmale, Retry, Dependencies, Fallbacks, Reasons, Status |
| `ActionCandidate` | dieselbe Bindung, beliebiger erlaubter Action Type, optional Need/Answer/Assessment Ref, Prioritäts-/Merkmalsdaten |
| `SelectedNextAction` | unveränderliche Decision-/Candidate-/State-Bindung, Aktion, schmale Payloadrefs, Fallbacks, Reasons, system Actor, Zeit |
| `AnswerContract` | Typ, erlaubte Werte/Einheit/Grenzen, Unknown/Skip, Validation Codes, alternative Contract Refs, Claim-Conversion-Ref |
| `PlannerContext` | Projekt/Conversation, Knowledge State + Version, Zielmodus, Readiness/Assessment Ref, Retry/Effort, Planner-Version, aktive Decision Ref |
| `PlannerDecision` | entweder `SelectedNextAction` oder `PlannerStopResult`, plus strukturierte Explanation; disjunkt |
| `PlannerStopResult` | Decision-/State-Bindung, Stop Reason, zulässiger nächster Systempfad, Need-/Assessmentrefs |
| `CandidateRejection` | Candidate-ID, geschlossene Ineligibility-Codes, betroffene Dependency-/Conflict-Refs |
| `RetryState` | Need-/Entitätsbindung, attempt_count, max_attempts, letztes kontrolliertes Outcome, Reopen-Status; keine Rohantwort |
| `CustomerEffortState` | Abschnittszähler, Unanswered/Retry/Photo-Zähler, diskrete Komplexität, Readiness, Cap-Status |

Alle Verträge sind strikt; keine freien Patchobjekte. IDs, Scores, Reason Codes, Retrylimits und Actor-Klassen werden serverseitig beziehungsweise durch pure Domainregeln bestimmt, nie vom Client autoritativ übernommen.

## 32. Referenzfälle

Auf Basis des synthetischen Ein-Raum-Falls:

| Fall | Erwartete Plannerentscheidung | Begründung |
|---|---|---|
| A Raumtyp bekannt, Fläche fehlt | `ask_approximate_number` für `room_area_sqm` | blockiert Level 2, hoher Sizing-Nutzen, gut beantwortbar, geringer Aufwand |
| B Fläche `unknown` | beim ersten Attempt einfachere Größenband-Alternative; danach `offer_assumption`, sofern Allowlist freigegeben | keine Schleife; Annahme sichtbar und begrenzt |
| C Fläche bekannt, Gebäudeart fehlt | kontrollierte Gebäudeartfrage, im MVP vorerst `ask_text`, später `ask_choice` | verbleibender Level-2-Bedarf; Choice fachlich besser, aber Paket 02 |
| D Innenposition unbekannt | `ask_yes_no`, ob ein möglicher Bereich bekannt ist | beantwortbarer als technische Positionsbeschreibung; Level-3-Wirkung |
| E Außenposition unbekannt | `ask_yes_no`, ob mögliche Aufstellfläche bekannt ist | klärt Wissen, bestätigt keine Eignung |
| F Leitungsweg unbekannt | einfache Kenntnisfrage nur bei Answerability; sonst erlaubte Annahme nur nicht-sicherheitsbestätigend oder Site Check | verborgene/riskante Details nicht erzwingen |
| G Elektro unbekannt | keine Annahme/Bestätigung; einmal Kenntnisfrage nur mit passendem Vertrag, andernfalls `mark_requires_site_check` | Safety-relevant und remote begrenzt |
| H widersprüchliche Raumgröße (Fixture E) | Clarification `ask_approximate_number` vor normalem Missing Need | Widerspruch senkt Readiness und beeinflusst Sizing |
| I Ziel Level 3 erreicht (Fixture C) | `present_intermediate_result` mit versionsgleichem Assessment | Ziel erreicht; Level 4 wird nicht automatisch verfolgt |
| J keine beantwortbaren Fragen | `mark_requires_site_check` für zulässige physische Needs, sonst `request_human_review`/Stop | kontrollierter Sackgassenausgang |

Fixture D bleibt Level-4-Domainreferenz, aber kein MVP-Plannerziel. Fixture F zeigt, dass Elektro-Site-Check sichtbar bleibt und keine automatische Elektrofreigabe entstehen darf.

## 33. Owner-Entscheidungen

Die Empfehlungen sind **nicht finalisiert**, außer „höchstens eine primäre Aktion“ folgt bereits verbindlich aus dem Produktprinzip.

| # | Offene Ownerentscheidung | Technische Empfehlung |
|---:|---|---|
| 1 | festes Ziel-Level | Level 3 `preliminary_installation` |
| 2 | eine Frage oder Gruppen | exakt höchstens eine primäre Aktion; keine Gruppen |
| 3 | maximale Wiederholungen | zwei Kunden-Attempts je Need, belastende Fotos höchstens einer |
| 4 | aufeinanderfolgende technische Fragen | Cap vier, dann Zwischenstand/Pause |
| 5 | Annahmen aktiv anbieten | ja, nur konkrete Allowlist und Zustimmung |
| 6 | erlaubte Annahmen | zunächst nur fachlich abgenommenes Raumflächenband; übrige Vorschläge zurückstellen |
| 7 | wann Zwischenstand | Ziel erreicht, Wunsch, Cap, Pause, nur Site Checks, keine Kandidaten oder Mensch |
| 8 | wann Site Check | remote unzuverlässig, nicht sicher annehmbar, vor höherer Aussage physisch nötig |
| 9 | wann Takeover | Safety/Gefahr, Konflikt, Sonderfall, Beschwerde/Mitarbeiter/Preis, Domainrand, Sackgasse |
| 10 | Fotos in 02-01? | nein, AP-15-03 separat |
| 11 | MVP-Antworttypen | `text`, `boolean`, `approximate_number`, `unknown`, `skip` |
| 12 | numerische Scores speichern | keine Gesamtzahl als Wahrheit; diskrete Komponenten + Regelversion, Laufzeitpunkte reproduzierbar |
| 13 | Tie-Break | Band, Nutzen, Aufwand, Readiness, Answerability, Attempts, stabile Schlüssel/ID |
| 14 | bewusst überspringen | ja; blockiert ggf. Readiness und sperrt Wiederholung bis Reopen |
| 15 | Gültigkeit offener Frage | bis Stateänderung, Supersession, Pause/definierter Ablauf; kein bloßes Blind-Senden |
| 16 | alte Antworten | als neue Evidence gegen aktuellen State prüfen, nie blind anwenden |
| 17 | Belastungsgrenze | vier technische Fragen je Abschnitt plus Need-Limits |
| 18 | kurze sichtbare Begründung | später kontrollierter Reason-Template-Key, keine freie Begründung |
| 19 | Fragen zunächst intern? | ja, bis Templates, Antwortverarbeitung, Security und Kanal separat freigegeben sind |
| 20 | Freigabeberechtigung | für ersten internen Vorschlag Admin/Reviewer fachlich festlegen; keine automatische Freigabe |

## 34. MVP-Empfehlung

Der vorgeschlagene AP-15-02-01-Scope ist noch zu breit, wenn er zugleich vollständige Unknown/Skip/Assumption/Site-Check-Lebenszyklen und Fixtures umfasst. Empfohlener Schnitt:

- **AP-15-02-01 Controlled Question Planner Domain Baseline:** pure illustrative Verträge in implementierter Form, kontrollierte Action-/Reason-/Ineligibility-Allowlisten, PlannerContext, Need/Candidate-Generierung für den Ein-Raum-Fall, Eligibility, Prioritätsbänder, diskrete Komponenten, stabiler Tie-Break, genau eine Aktion oder Stop, Retry-/Effort-State; keine Texte/Fotos/Persistenz.
- **AP-15-02-02 Question Templates and Answer Contracts:** konkrete Answer Contracts, Unknown/Skip-Eingangssemantik, Templatekatalog, Claim-Conversion-Verträge sowie Annahme-/Site-Check-Fallbackdetails. Falls Owner die Raumflächenannahme noch nicht fachlich freigibt, bleibt sie hier nur als ineligible Pfad.

So ist 02-01 klein genug, um fachliche Auswahl isoliert zu testen, ohne Parser, Formulierung oder Mutationssemantik hineinzuziehen.

## 35. Teststrategie

Spätere, nicht in diesem Audit ausgeführte/implementierte Vitest-Strategie:

- **Eligibility:** bekannte Information, wirksamer Claim, `not_applicable`, angenommener/Site-Check-Pfad, Retrylimit, Dependency, Widerspruch, Human Takeover, stale State, fehlende Entität.
- **Generation:** Missing Information nach Importance/Reason/Level, Safety, Sizing, Installation, Widerspruch, Annahme, Unknown und Stop Candidate; keine Frage aus jedem Missing Key erzwingen.
- **Scoring/Priorität:** Safety vor Komfort, Blocker vor Genauigkeit, Aufwand bei ähnlichem Nutzen, Wiederholungsstrafe, Widerspruchsbonus, stabiler Tie-Break, keine Prozentwerte, Constraint nie durch Score überstimmt.
- **Selection:** exakt eine Aktion, keine geeignete Aktion, Zwischenstand, Mensch, Site Check, stale/superseded Decision, identischer Context ergibt identisches Resultat.
- **Unknown/Skip:** erster/zweiter Unknown, Skip/Reopen, Annahme, Site Check, keine Endlosschleife.
- **Readiness:** festes Ziel, erreicht/nicht erreicht, nur Site Checks offen, Widerspruch blockiert, kein automatisches Level 4/5.
- **Race Conditions:** parallele States, alte Antwort, Reviewer-Korrektur, verspätete Analyse, CAS-Konflikt und Replan.
- **Architecture:** pure Funktionen; keine Supabase-/UI-/Persistenz-/KI-/WhatsApp-/Preislogik; keine Dependency- oder `package.json`-Änderung.

Tests brauchen fachlich abgenommene synthetische Fixtures und müssen Regel-/Planner-Versionen explizit binden. Dieses Audit hat gemäß Auftrag keine Anwendungstests ausgeführt.

## 36. Production Gates

Vor jeder produktiven Nutzung müssen mindestens erfüllt sein:

1. Ownerentscheidungen 1–20 dokumentiert und Klima-Fachowner hat Safety-, Site-Check-, Annahme- und Prioritätskatalog abgenommen.
2. AP-15-01-Multi-Entity-/Multi-Room-Grenze fachlich und technisch geklärt.
3. Strikte Zod-/Domainverträge, pure Regeln und vollständige Regressionen implementiert; keine Clientautorität über Scores/Reasons/Actors.
4. Persistenz-, RLS-, Retention-, Audit- und CAS-Design separat geprüft und migriert.
5. Antwortingestion, alte Antworten, Idempotenz, Ordering und Supersession separat abgesichert.
6. Templates barrierearm, deutsch, semantisch kontrolliert und fachlich freigegeben; keine freie Fragegenerierung.
7. Photo Request, Storage/Datenschutz und mögliche Visionanalyse separat freigegeben.
8. Human-Takeover-Workflow, Rollen, SLA und keine automatische Freigabe nachgewiesen.
9. Belastungscaps, Unknown/Skip und Stop-Pfade in realistischen synthetischen Abläufen validiert.
10. Monitoring speichert nur strukturierte Merkmale ohne PII, Rohnachrichten, Prompts oder Chain-of-Thought.
11. Kein Preis-/Angebotsoutput vor eigener deterministischer Preis-/Freigabearchitektur.
12. Transport/WhatsApp erst nach AP-16-00, Consent-/Security-/Provider-Audit und manueller Freigabe.

## 37. Folgepakete

Das AP-15-00-Audit hatte eine vorläufige Sequenz, in der Evidence/Readiness und Planner als AP-15-02 bis AP-15-04 getrennt waren. Die gemergte AP-15-01-Implementierung umfasst Evidence References, Missing Information, Readiness und Assessment bereits als Baseline. Deshalb dokumentiert diese aktuelle Auditreihe bewusst die nun vorgegebene, feinere Nummerierung; sie ersetzt nicht rückwirkend alte Audittexte:

| Paket | Inhalt | Explizit ausgeschlossen |
|---|---|---|
| AP-15-02-01 | Controlled Question Planner Domain Baseline | Templates, UI, Persistenz, KI, Transport |
| AP-15-02-02 | Question Templates and Answer Contracts | freier LLM-Text, Versand |
| AP-15-03 | Photo Request Planner | Visionanalyse/automatische Bestätigung |
| AP-15-04 | Internal Conversation Simulator Audit | Implementierung |
| AP-15-05 | Internal Conversation Simulator Implementation | WhatsApp, KI |
| AP-15-06 | Knowledge Extraction Audit | produktive Extraktion |
| AP-15-07 | LLM Task Adapter | freie fachliche Entscheidung/Freigabe |
| AP-15-08 | Vision Analysis Contract | autonome technische Bestätigung |
| AP-15-09 | Human Review and Correction Workflow | automatische Freigabe |
| AP-16-00 | WhatsApp Transport Audit | Transportimplementierung |

Persistenz/Data/RLS sowie Preis-/Offer-Integration benötigen eigene, noch nicht nummerierte Auditpakete und dürfen nicht beiläufig in diese Folgepakete gelangen.

## 38. Kleinstes nächstes Paket

**AP-15-02-01 — Controlled Question Planner Domain Baseline**, erst nach Ownerentscheidung. Kleinster Scope: Ein-Raum-Kontext; geschlossene Domainkonstanten/strikte Schemas; ActionCandidate, PlannerContext, Retry/Effort, Rejection, Selected/Stop; Kandidatenerzeugung aus bestehender Missing Information und Contradictions; harte Eligibility; Prioritätsbänder; kleine diskrete Komponenten; stabiler Tie-Break; exakt eine Aktion oder Stop; synthetische Tests.

Ausgeschlossen bleiben Answer-Parser/-Konvertierung, produktive Templates, Fotoanweisung, UI/Simulator, Persistenz, Supabase, KI/LLM/Vision, WhatsApp und Preis/Angebot. Annahme- und Site-Check-Aktionen werden als kontrollierte Kandidaten/Stop-Pfade modelliert, mutieren aber keinen Claim.

## 39. Status

- **AP-15-01 CONVERSATION DOMAIN BASELINE — IMPLEMENTED**
- **CONTROLLED QUESTION PLANNER — NOT IMPLEMENTED**
- **QUESTION TEMPLATES — NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER — NOT IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR — NOT IMPLEMENTED**
- **AI ANALYSIS — NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION — NOT IMPLEMENTED**
- **OFFER GENERATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**

**Auditstatus: READY FOR OWNER DECISION.** Ausdrücklich nicht `APPROVED FOR IMPLEMENTATION` und nicht Production Ready.

## 40. Scope-Bestätigung

Dieses Paket enthält ausschließlich dieses Auditdokument. Es enthält ausdrücklich:

- ausschließlich Audit, Analyse und Dokumentation;
- keine Implementierung und keine Domainmodule/TypeScript-Dateien;
- keine UI, Route, Action, Services oder internen Simulator;
- keine Persistenz, Migration, SQL, RPC, RLS, Grants oder Supabase-Nutzung;
- keine KI-, LLM-, Vision- oder WhatsApp-Integration;
- keine produktive Frageformulierung, Templates, Prompts, Fotoanweisung oder Kundenkommunikation;
- keine Preis- oder Angebotsberechnung/-generierung und keine automatische Freigabe;
- keine Tests oder Teständerungen und gemäß Auftrag keine Ausführung von Anwendungstests;
- keine externe Abhängigkeit und keine `package.json`-Änderung;
- keine echten Kundendaten oder personenbezogene Telemetrie.

Alle Architektur- und DTO-Beispiele sind nicht ausführbare Planungsartefakte. Der nächste Schritt ist eine dokumentierte Ownerentscheidung, nicht die Behauptung einer Implementierungs- oder Produktionsfreigabe.
