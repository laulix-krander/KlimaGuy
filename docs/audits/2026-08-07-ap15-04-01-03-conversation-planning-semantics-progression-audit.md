# AP-15-04-01-03 — Conversation Planning Semantics and Progression Audit

## Audit-Metadaten

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-07-AP15-04-01-03-CONVERSATION-PLANNING-SEMANTICS-PROGRESSION-V1` |
| Datum | 2026-08-07 |
| Baseline-Branch | `work` |
| Baseline-HEAD | `10acba931d21358b02f2b8293e070684b24ab4d4` |
| Audit-Branch | `codex/audit-ap15-04-01-03-conversation-semantics` |
| Status | **READY FOR OWNER DECISION** |
| Produktionsstatus | **NOT PRODUCTION READY** |

## Executive Summary

Die sichtbaren Simulatorbefunde sind durch den aktuellen Code erklärbar und keine isolierten UI-Probleme. Die Pipeline bindet `information_key` unmittelbar an `property_key`; fünf Ja/Nein-Fragen vermischen technische Realität, Kundenwissen, Präferenz und Beobachtbarkeit. Insbesondere wird „Nein“ bei einer epistemischen Frage als fachlicher Boolean-Claim `false/reported` gespeichert und von Readiness als benutzbare beziehungsweise klassifizierte technische Information gewertet.

Die Reihenfolge entsteht aus globalen Prioritätsbändern und statischen Scores: Elektro liegt im Band `safety`, Positions- und Installationsfragen im Band `feasibility`, während Raum- und Gebäudegrundlagen nur `readiness_blocker` sind. Alle `dependency_keys` sind leer. Nicht fragbare Needs bleiben im Missing-Information-Modell, ohne Kandidaten zu erzeugen. Dadurch werden Details vor Projektkontext erhoben.

Das Zwei-Attempt-Limit funktioniert mechanisch, aber nur die Raumgröße hat eine echte Retryvariante. Andere Needs erhalten beim zweiten Versuch denselben Text und Vertrag; es gibt keinen Nachweis eines neuen Informationswegs. Nach zwei erfolglosen Versuchen werden einzelne Needs als Site Check angeboten, doch diese nicht-fragenden Actions besitzen keinen vollständigen Answer-/Transition-Lifecycle. Das System unterscheidet Collection State und Technical Knowledge nicht ausreichend.

Der häufige Human Review hat zwei konkrete Hauptursachen: (1) `room_type` und `building_type` werden geplant und gerendert, ihre Mapping-Regeln sind aber `deferred`; jede beantwortete Textfrage endet mit `unsupported_text_mapping` und `requires_human_review=true`; (2) Zahlenbereiche werden normalisiert, aber mit `numeric_range_not_supported` ebenfalls an Human Review gegeben. Zusätzlich führen geschützte Reviewer-Claims, ausgewählte Transition-/Cycle-Invarianten und explizite Takeover-Gründe dorthin. Ein Planner-Dead-End wird derzeit zwar als `end_collection`, nicht direkt als Human Review modelliert; semantisch wird er jedoch fälschlich mit `customer_effort_break` begründet und die Simulator-UI kann Nicht-Human-Fehler als Site-Check-Ende darstellen. Human Review ist damit nicht der einzige Fallback, aber die fachlichen Grenzen sind inkonsistent.

Empfohlen wird ein **hybrides Modell (Variante E)**: technische Claims bleiben ausschließlich Aussagen über die technische Welt; ein separater Collection-/Information-Need-State hält Antwortfähigkeit, Kundenwissen, Defer/Skip, Attempts und Revisit-Gates; Evidence erhält eine kleine kontrollierte observation-/epistemic-semantische Klassifikation. Für die Progression wird **Modell D, Goal-/Dependency-Graph mit kontrollierten Prioritätsbändern**, empfohlen. Phasen dienen als weiche, erklärbare Progressionsbänder, Dependencies als harte Eligibility-Gates. Die bestehende deterministische Scoringlogik bleibt innerhalb des jeweils zulässigen Bandes nutzbar.

Vor Implementierung sind Ownerentscheidungen erforderlich. Der kleinste sichere Folgeschritt ist ausschließlich der semantische Contract für Technical Facts, Customer Knowledge, Collection State und Answer Meaning; Planner oder UI dürfen davor nicht angepasst werden.

## Current Architecture

### Tatsächlich implementierte Pipeline

1. Der Simulator startet mit einer synthetischen `ConversationCycleContext`-Fixture und einer bereits gebundenen gerenderten Frage; auch „leer“ startet konkret mit der Raumgrößenfrage.
2. Der Renderer liefert Template und `AnswerContract`; alle aktiven Ja/Nein-Verträge bieten `yes`, `no`, `unknown`, `skip` und maximal zwei Attempts.
3. `normalizeCustomerAnswer` validiert Bindung und Form und erzeugt unter anderem `answered/boolean`, `unknown`, `skipped` oder Zahlenbereich.
4. `interpretNormalizedAnswer` fordert eine 1:1-Regel `information_key → property_key`. Boolean `yes/no` wird direkt `true/false`, epistemischer Status `reported`. Unknown wird als Null-Claim auf derselben technischen Property gespeichert; Skip erzeugt keinen Claim.
5. Bestehendes Unknown oder eine Annahme kann superseded werden. Andere abweichende Kundenwerte werden parallel als Widerspruch erhalten; Reviewer-Korrekturen sind geschützt.
6. `applyStateTransitionProposal` wendet immutable und versionsgebunden an. No-change-Typen ändern die State-Version nicht.
7. Retry State zählt nur `unknown`/`skipped` bis zwei; `answered` erhöht nicht. Customer Effort zählt jede technische Frage, Unknown/Skip und Wiederholung.
8. `deriveMissingInformation` betrachtet einen Claim als benutzbar, sofern sein Status nicht `unknown` oder `contradicted` ist. Deshalb ist auch Boolean `false/reported` „vorhanden“.
9. `deriveReadiness` verlangt für Level 3 nur irgendeine Klassifikation der drei Position-/Leitungsweg-Properties (`hasClass`), einschließlich Unknown; die Level-1-Grundlagen besitzen aber teilweise keine aktiven End-to-End-Mappings.
10. Der Planner generiert nur für acht RULES Kandidaten. Prioritätsband, statische Featureklassen, Retry-Penalty und lexikalische Tie-Breaks bestimmen deterministisch die Auswahl. Dependencies sind immer leer.
11. Nach vier technischen Fragen wird ein Intermediate Result erzeugt. Continuation setzt nur `consecutive_technical_questions` zurück und plant auf demselben Knowledge/Retry State neu.
12. Der Simulator übernimmt Result, Transcript und Inspector. Er ist kein eigener fachlicher Planner, exponiert aber die Engine-Semantik.

### Relevante Contract-Lücken

- Property Keys kodieren teilweise „known“, ohne festzulegen, **wem** etwas bekannt ist und ob „known=false“ technische Abwesenheit, fehlende Wahl oder fehlendes Wissen meint.
- `EvidenceReference` kennt Quelle, Actor und Status, aber keine Aussageart wie observation, customer-knowledge report, preference oder feasibility opinion.
- Missing Information ist vollständig aus Technical Claims abgeleitet und kennt kein „Kunde kann es aktuell nicht beantworten“.
- Retry State kennt Attempts und letztes Outcome, aber weder Template-/Rule-Version noch Kontextfingerprint, Gain-Grund oder Revisit-Berechtigung.
- Planner-Outcomes und UI-Status bilden Site Check, Evidence später, Pause und „für Ziel ausreichend“ nicht trennscharf end-to-end ab.

## Reproduced Simulator Findings

| Befund | Codebasierte Reproduktion / Ursache | Einstufung |
|---|---|---|
| A — unnatürliche Reihenfolge | `electrical_supply_known` ist `safety`; Position/Route sind `feasibility`; Grundlagen sind `readiness_blocker`; Priority-Bands schlagen Scores, Dependencies sind leer. Der Empty-Start setzt Raumgröße außerhalb des Planners als erste Frage. | reproduziert |
| B — Knowledge vs Property | Boolean-Normalisierung plus 1:1-Mapping speichert `no` als `false/reported` direkt unter `*_known`. Fragewortlaut fragt teils Wissen/Idee, nicht technische Realität. | reproduziert |
| C — identischer Retry | Attempts=1 setzt nur Reason `retry_simplified`; ausschließlich Raumgröße wechselt auf ein Retry-Template. Alle Boolean-Fragen bleiben wortgleich. | reproduziert |
| D — redundanter Leitungsweg | `dependency_keys=[]`; Route darf vor Innenposition gefragt werden. Unknown bleibt Missing; ein Context Change wird nicht erfasst. Nach Break kann derselbe Need erneut zulässig sein. | reproduziert |
| E — frühes Human Review | `building_type`/`room_type` sind planbar und renderbar, aber Interpretation Registry `deferred`; Textantwort → `unsupported_text_mapping` → Cycle-Failure Human Review. Range → `numeric_range_not_supported`. | reproduziert |
| G — zweites Continue reagiert nicht | Der konkrete manuelle Lauf ist **`observed_but_not_deterministically_reproduced`**. Vorhandene Tests decken nur ein Intermediate→Continue und Doppelklick auf denselben Button ab, nicht zwei vollständige Blocks. | offen, nicht spekulativ |

### Exakte Erklärung der beiden positiven/negativen manuellen Pfade

Beim positiven Pfad werden `true/reported` Claims für Elektro, Außenposition, Leitungsweg, Innenposition und Zugänglichkeit erzeugt. Nach jeweils vier technischen Fragen erzwingt Customer Effort ein Intermediate Result. `desired_installation_scope`, `requested_room_count` und `room_type` bleiben offen; für die ersten beiden existiert keine Planner-RULE. Sobald `building_type` oder `room_type` ausgewählt und mit „Einfamilienhaus“ beziehungsweise Text beantwortet wird, findet die Interpretation zwar eine Regel, lehnt sie wegen `status: deferred` aber vor jeder Claim-Erzeugung als `unsupported_text_mapping` mit Human Review ab. „Alle sichtbaren technischen Booleans = Ja“ kann diesen Contractbruch nicht verhindern.

Im zweiten Pfad werden die Antworten „Nein“ fälschlich als technisch verwertbare `false/reported` Claims gespeichert; Unknown bei Zugänglichkeit bleibt ein Null-Claim und erzeugt Retrybedarf. Das behebt die nicht unterstützten Textmappings nicht. Sobald Gebäude-/Raumtyp beantwortet wird, entsteht derselbe Human-Review-Fehler. Falls keine eligible RULE mehr existiert, liefert der Planner dagegen `no_eligible_candidate → end_collection` mit dem sachlich falschen Reason `customer_effort_break`; dieser Pfad ist **kein** echter Human Review.

## Question Semantics Audit

### Semantische Kategorien

1. **technical_property**: überprüfbare Eigenschaft der Anlage/Umgebung, z. B. „Ein geeigneter Anschluss ist vorhanden.“
2. **customer_knowledge**: Kunde kennt/erkennt eine Information, ohne technische Wahrheit zu behaupten.
3. **preference_or_plan**: gewünschte oder vorläufig gewählte Position.
4. **customer_assessment**: nicht bestätigte Machbarkeits-/Eignungseinschätzung.
5. **availability_or_observability**: Information oder Evidenz ist jetzt beschaffbar/beobachtbar.

| Template | Oberfläche fragt tatsächlich | Kategorie(n) | Aktuelle Property |
|---|---|---|---|
| `ask_indoor_position_known` | Hat der Kunde eine Idee für eine Wand? | preference_or_plan + customer_knowledge | `indoor_unit_position_known` |
| `ask_outdoor_position_known` | Weiß der Kunde einen möglichen ungefähren Ort? | customer_knowledge + preference_or_plan + customer_assessment | `outdoor_unit_position_known` |
| `ask_line_route_known` | Ist jemandem eine mögliche Führung ungefähr bekannt? | customer_knowledge + customer_assessment | `line_route_known` |
| `ask_electrical_supply_known` | Weiß der Kunde, ob ein geeigneter Anschluss vorhanden ist? | customer_knowledge über technical_property; „geeignet“ verlangt Fachurteil | `electrical_supply_known` |
| `ask_accessibility_known` | Ist der bereits geplante Bereich per normaler Leiter erreichbar? | technical_property + customer_assessment; setzt geplanten Bereich voraus | `accessibility_known` |
| Raumfläche | ungefähre technische Zahl | technical_property, reported/estimated | `room_area_sqm` |
| Raum-/Gebäudeart | fachliche Klassifikation aus Kundentext | technical_property/classification | Mapping deferred |

Die fünf Boolean-Fragen sind somit nicht semantisch homogen. Ein gemeinsamer generischer Boolean-Mapper ist fachlich unzureichend.

## Boolean Semantics Matrix

| Information Key / Entity / Property | sichtbarer Text und tatsächliche Frage | Ja | Nein | Unknown / Skip | aktuelles Claim Mapping | gewünschtes Mapping | Fehlrisiko |
|---|---|---|---|---|---|---|---|
| `indoor_unit_position_known` / room / gleichnamig | „Hast du schon eine Idee, an welcher Wand das Innengerät hängen könnte?“; Idee/Wunsch vorhanden? | Kunde kann eine Präferenz nennen; keine Eignungsbestätigung | noch keine Idee/Wahl; nicht „Position technisch unmöglich“ | Unknown: Kunde kann Wissensstand nicht einordnen; Skip: keine Aussage/Collection defer | Ja/Nein → technical Boolean `true/false`, `reported`; Unknown → Null-Claim derselben Property; Skip → kein Claim | Collection: `customer_can_specify_position=yes/no/unknown`; optional Preference-Evidence; technische Position bleibt unknown bis konkrete Position/Evidence | False wird als abgeschlossene Installationsinformation gewertet; falsche Readiness |
| `outdoor_unit_position_known` / installation / gleichnamig | „Weißt du schon, wo …?“; Wissen plus mögliche Planung | Kunde kennt/hat Kandidatenort | Kunde kennt/hat noch keinen Ort | Unknown: kann Wissens-/Möglichkeitsfrage nicht beantworten; Skip: keine Aussage | direkt `true/false/reported`; Unknown Null; Skip nichts | Collection-Fact über Antwortfähigkeit; technische Position unknown; erst konkreter Ort als technischer/planerischer Claim | „Nein“ wird technische Negativaussage; Foto-/Site-Check-Pfad blockiert oder falsch klassifiziert |
| `line_route_known` / installation / gleichnamig | „Ist ungefähr bekannt, wie … geführt werden könnten?“; Verfügbarkeit einer groben Hypothese | eine Route kann beschrieben werden, nicht automatisch machbar | keine Route bekannt/entworfen | Unknown: Kunde kann keine Route einschätzen; Skip: defer | direkt `true/false/reported`; Unknown Null | Need-State `customer_can_describe=false/unknown`; Route-Hypothese separat mit Beschreibung/Evidence; technische Machbarkeit unknown | False kann „nicht möglich“ vortäuschen; true kann Machbarkeit vortäuschen; redundante Revisit-Schleife |
| `electrical_supply_known` / installation / gleichnamig | „Weißt du, ob … geeigneter Stromanschluss vorhanden ist?“; Wissen über Vorhandensein und Eignung | Kunde glaubt, Anschluss vorhanden/geeignet | mehrdeutig: weiß, dass keiner vorhanden ist **oder** Antwort auf „weißt du“ = nein | Unknown: passend für fehlendes Wissen; Skip: defer | direkt `true/false/reported`; Unknown Null | Frage aufteilen: beobachtbares Vorhandensein/Art vs fachliche Eignung; Kundenaussage nur reported observation; Eignung durch Evidence/Experte/Site Check | Safety-relevantes false/true wird ohne fachliche Prüfung „usable“ |
| `accessibility_known` / installation / gleichnamig | „Ist der geplante Montagebereich … erreichbar?“; konkrete technische Zugänglichkeit, aber nur falls Bereich existiert | Kunde schätzt erreichbar | Kunde schätzt nicht erreichbar; keine Knowledge-Negation | Unknown: nicht einschätzbar; Skip: defer | direkt `true/false/reported`; Unknown Null | `customer_accessibility_assessment=yes/no/unknown`; technische Zugänglichkeit reported/unknown mit niedrigem Assurance-Level; Dependency auf konkrete Area | identischer Retry; ohne Position bedeutungslose Antwort; Safety-/Kostenfehleinschätzung |

Zusätzliche Boolean-Properties ohne aktuelle Kundenfrage: `roof_floor` und `condensate_route_known`. Sie dürfen nicht implizit dieselbe Semantik erben. Für Kondensat, Kernbohrung und Dachgeschoss sind vor Einführung eigene Answer-Meaning-Tabellen erforderlich. „Nicht anwendbar“ muss ein explizites, begründetes Outcome sein und darf weder `false` noch Skip sein.

## Customer Knowledge vs Technical Property

### Variantenvergleich

| Variante | Wahrheit/Evidence/Vision | Widerspruch, Supersession, Missing/Readiness | Analytics/Migration/Komplexität | Urteil |
|---|---|---|---|---|
| A — Property behalten, Mapping/Text ändern | verbessert einzelne Fragen, kann aber Wissen und Welt nicht gleichzeitig halten; Foto-/Expert-Evidence kollidiert weiter semantisch | alte false-Claims bleiben mehrdeutig; Widersprüche vermischen Wissensänderung mit Weltänderung | kleinste Migration, aber schlechte Messbarkeit | nicht ausreichend |
| B — `customer_knowledge_*` Properties | klare Trennung für aktuelle fünf Fälle; Foto kann Technical Claim liefern | zwei Claimfamilien; Readiness muss ausschließlich Technical Claims lesen | moderate Migration, viele keys, Gefahr eines Property-Wildwuchses | besser, allein zu starr |
| C — Collection State getrennt vom Technical Knowledge State | Unknown/Skip/Can-answer/Attempts sauber; Missing kann „technisch offen, Kunde ausgeschöpft“ ausdrücken | technische Widersprüche bleiben rein; Supersession von Collection-Facts separat | gute Analytics; neuer Contract und Migration nötig | notwendig |
| D — Evidence/Claim um epistemische/observation Dimension | Quellen wie Kunde, Foto, Vision, Reviewer werden präzise; Aussagenart bleibt nachvollziehbar | sehr gute Widerspruchs- und Korrekturqualität, sofern technische Aussage vorhanden | erhöht Claim-/Evidence-Komplexität; allein löst Progression nicht | ergänzend notwendig |
| E — Hybrid aus C plus kleiner D-Dimension; explizite Knowledge-Facts nur wo fachlich nötig | beste Anschlussfähigkeit für Foto, Vision, Reviewer und Chats; technische Wahrheit bleibt getrennt | Missing/Readiness liest technische Claims; Planner liest zusätzlich Collection State; Widersprüche sind typisiert | höchste initiale Designarbeit, aber kontrollierbare Migration und belastbare Analytics | **Empfehlung** |

### Empfohlenes semantisches Prinzip (nicht implementiert)

- **Technical Knowledge State** enthält nur propositionsfähige Aussagen: Wert/Status über Raum, Gebäude oder Installation, jeweils mit Evidence und Assurance/Epistemik.
- **Collection State pro Information Need** enthält `answerability`, `collection_outcome`, Attempts, letztes Ask, Context-Fingerprint, erlaubte Evidenzkanäle, Defer und Revisit-Gate.
- **Evidence Semantics** verwendet eine geschlossene Aussageart, etwa `technical_observation`, `customer_knowledge_report`, `preference`, `feasibility_assessment`, `document_or_media_observation`, `expert_determination`.
- Ein Kunden-„Nein“ darf nur anhand eines versionierten Answer-Meaning-Contracts gemappt werden. Es ist nie automatisch gleichbedeutend mit technischem `false`.
- Readiness darf Collection-Abschluss nicht mit technischer Vollständigkeit verwechseln. Sie kann aber einen technisch offenen Punkt als Foto-, Site-Check- oder Annahmeweg klassifizieren.

## Conversation Progression

### Modellvergleich

Bewertung: 1 = schwach/hoch riskant, 5 = stark; bei MVP-Komplexität bedeutet 5 = einfach.

| Kriterium | A globales Scoring | B harte Phasen | C Phasen + Eligibility | D Goal-/Dependency-Graph + Prioritätsbänder |
|---|---:|---:|---:|---:|
| Kundenfreundlichkeit | 2 | 4 | 5 | 5 |
| Fachlichkeit | 2 | 3 | 4 | 5 |
| Sackgassenresistenz | 2 | 2 | 4 | 5 |
| Determinismus | 5 | 5 | 5 | 4 |
| Testbarkeit | 4 | 5 | 5 | 4 |
| Erweiterbarkeit | 2 | 2 | 4 | 5 |
| Foto/Vision | 2 | 3 | 4 | 5 |
| Knowledge-Base-/historische Lernschleifen | 3 | 2 | 4 | 5 |
| WhatsApp-Eignung | 2 | 3 | 5 | 5 |
| MVP-Komplexität | 5 | 4 | 3 | 2 |

**A** ist deterministisch, aber optimiert lokal und erzeugt die beobachtete Reihenfolge. **B** ist verständlich, blockiert aber unnötig, wenn ein Kunde einzelne frühe Angaben nicht kennt. **C** ist ein guter UI-/MVP-Kompromiss, benötigt aber weiterhin Dependencies und saubere Auswege. **D** bildet fachliche Ziele und alternative Evidencepfade am besten ab. Empfehlung: D mit wenigen kontrollierten Progressionsbändern, die wie weiche Phasen wirken; kein frei gewichteter Graph und keine harte Acht-Phasen-Wasserfalllogik.

Empfohlene Bänder: (1) Scope/Bedarf, (2) Raum/Dimensionierungsbasis und Gebäude, (3) Positionshypothesen, (4) abhängiger Installationsweg, (5) technische Nebenbedingungen, (6) Evidence-Erhebung, (7) Assessment/Exit. Ein späteres Band darf nur vorgezogen werden, wenn ein expliziter Safety-Trigger **konkret vorliegt**, nicht weil ein fehlendes Feld pauschal als safety-relevant bezeichnet wurde.

## Dependency Analysis

| Need | heutige Dependency | fachlich notwendige Eligibility | zulässiger Revisit |
|---|---|---|---|
| Innenposition | keine | Raum/Scope identifiziert; Kunde darf Präferenz früh äußern | konkrete Rauminfo, Foto/Grundriss oder neue Präferenz |
| Außenposition | keine | Projekt-/Gebäudekontext mindestens grob; als Präferenz nicht als Eignung | Außenfoto, Eigentums-/Gebäudeinfo, Expertenhinweis |
| Leitungsweg | keine | mindestens referenzierbare Innen- **und** Außenpositionshypothese oder alternative Plan-/Foto-Evidence | nur nach neuer/änderter Position, Foto, Grundriss, widersprechender Evidence oder konkretisierter Hilfsfrage |
| Zugänglichkeit | keine | konkreter Montagebereich muss referenzierbar sein | neue Position/Foto/Höheninformation |
| Elektro | keine | frühe Beobachtungsfrage möglich; Eignungsfrage erst mit technischem Kontext | Foto Typenschild/Verteilung, Anschlussdaten, Expert-/Site-Evidence |

`line_route_known` ist als einfacher technischer Boolean nicht ausreichend. Eine Route ist mindestens eine Hypothese mit Endpunkten, Beschreibung/Geometrie, Evidenz und Machbarkeitsstatus. Für den MVP kann die Detailsprache klein bleiben; dennoch muss „Kunde kann eine grobe Route beschreiben“ vom technischen Ergebnis getrennt sein.

## Retry / Revisit Semantics

Das Maximum von zwei Attempts bleibt als harte Obergrenze pro unverändertem Need/Context erhalten. Ein zweiter Attempt ist aber nur eligible, wenn er einen anderen Erkenntnisweg bietet. „Zwei andere Fragen wurden gestellt“ ist kein Gain.

### Geschlossene Taxonomie `retry_strategy` / `information_gain_reason`

| Code | Bedeutung | Beispiel |
|---|---|---|
| `clarified_question` | Semantik wurde enger/verständlicher formuliert | Raumgröße in Größenklassen statt Wiederholung |
| `guided_example` | neue konkrete Hilfe oder Beobachtungsanleitung | „Sieh am Sicherungskasten nach …“ |
| `dependency_resolved` | benötigte vorgelagerte Information ist neu verfügbar | Innen- und Außenposition machen Route erstmals sinnvoll |
| `new_customer_evidence` | Kunde liefert neue Beschreibung/Dokument/Grundriss | Grundriss eingegangen |
| `new_media_evidence` | relevantes Foto/Video ist verfügbar | Außenbereichsfoto |
| `new_external_or_expert_evidence` | Reviewer/Regel/validierte Quelle ergänzt oder widerspricht | Experte markiert Kandidatenposition |
| `assumption_confirmation` | kontrollierte Annahme wird ausdrücklich bestätigt/verworfen | grobe Fläche |
| `correction_or_contradiction_resolution` | konkrete abweichende Evidence verlangt Klärung | 20 vs 35 m² |

Ohne einen dieser Gründe lautet das Outcome nach Unknown/Skip nicht Retry, sondern je nach Need `leave_open`, `defer`, `continue_with_other_need`, `request_evidence_later`, `assumption`, `site_check`, `intermediate_result` oder in eng begrenzten Fällen `human_review`. Immediate Unknown→identische Frage ist unzulässig. Ein Revisit nach Break benötigt ebenfalls einen neuen Context-Fingerprint, nicht bloß einen zurückgesetzten Effort-Counter.

## Information Gain

Ein Revisit-Entscheid muss mindestens Need-ID, technische Entity, vorherige Antwortsemantik, vorheriges Template/Version, State-Version, Dependency-/Evidence-Fingerprint und Gain-Reason vergleichen. Messbar sein müssen `attempt_number`, `revisit_reason`, `changed_context`, `outcome`, `claim_effect` und `next_action`. PII-freie IDs und kontrollierte Codes genügen; Rohchat muss dafür nicht in Planner-Telemetrie kopiert werden.

## Human Review Root-Cause Analysis

| Trigger | aktueller Codepfad | fachlicher Grund | Human nötig? | bessere Alternative | Safety |
|---|---|---|---|---|---|
| `safety_conflict` | nur explizites `human_takeover_reason` → Planner stop | bestätigter Sicherheitskonflikt | ja, wenn konkret | bis Review keine technische Freigabe | hoch |
| `reviewer_protected_claim` | Interpretation oder Transition verweigert Supersession | manuelle Korrektur schützen | meist ja | gezielter Review-Task, kein globaler Gesprächsabbruch | mittel/hoch |
| `unsupported_answer_semantics` | deferred Text / Textwert → `unsupported_text_mapping` → Cycle Human Review | Implementationslücke | **nein, nicht automatisch** | kontrolliert offen lassen/anderer Kanal; Mapping erst separates Paket | niedrig bis mittel |
| `unsupported_numeric_range` | normalisierter Range → `numeric_range_not_supported` → Human Review | Contract-/Mapper-Lücke | nein | Range erhalten oder kontrollierte Konkretisierung/Annahme | niedrig |
| `contradictory_claim` | paralleler Claim `contradiction_recorded`; Planner fragt denselben Need | echte Abweichung, aber untypisiert | manchmal | Korrekturfrage; Human nur safety/protected/mehrfach ungelöst | kontextabhängig |
| `domain_out_of_scope` | explizites `outside_mvp_domain` | nicht unterstützte Domäne | gegebenenfalls | `domain_not_supported`, optional Übergabe | kontextabhängig |
| `customer_requests_human` | explizites Takeover | Kundenwunsch | ja | direkte Übergabe | neutral |
| `planner_dead_end` | kein Candidate → `end_collection`, Reason fälschlich `customer_effort_break` | RULE-/Eligibility-Lücke | **nein** | `collection_sufficient`, paused, evidence/site-check oder expliziter unsupported exit | Risiko durch falsche Darstellung |
| `missing_information_only` | Candidates oder Dead-End | normale Lücke | nein | weiter, offen lassen, defer/assumption | niedrig |
| `site_check_required` | nach zwei Attempts Candidate `mark_requires_site_check`; Lifecycle unvollständig | vor Ort prüfbar | nein | eigener terminaler/teilterminaler Action-Typ | schützt Safety |
| `photo_needed` | existiert nicht | visuell prüfbar | nein | später `request_evidence_later/photo` | schützt gegen Raten |
| `assumption_possible` | nur drei registrierte Annahmen; nach zwei Attempts | kontrollierbare Unsicherheit | nein | Bestätigung, klar markiert | nur nicht-safety |
| `possible_hazard` / `no_safe_customer_action` | explizites Takeover | Gefahr/keine sichere Selbstaktion | ja | stoppen und gezielt prüfen | hoch |
| Cycle-/Transition-Invariant | `cycle_version_invariant_failed`, diverse Apply-Fehler | technischer Integritätsfehler | fachlicher Human nicht zwingend | operativer Fehlerpfad/Replan; fachliche Freigabe blockiert | indirekt hoch |

Wichtig: Der Planner erzeugt bei fehlenden Kandidaten aktuell **kein** Human Review, aber auch keine fachlich richtige Abschlusssemantik. Die häufig sichtbare Review-Meldung stammt primär aus nicht unterstützter Answer Interpretation. Human Review darf künftig weder Implementationslücke noch Dead-End-Sammelbecken sein.

## Termination Semantics

| fachlicher Blockausgang | heute vorhanden? | heutige Entsprechung / Lücke |
|---|---|---|
| `selected_customer_question` | ja | `selected_action` mit Ask-Action |
| `present_intermediate_result` | teilweise | Stop bei Target oder Effort; gerenderter Intermediate wird im Cycle nicht als Interaction geliefert, UI baut Status |
| `request_evidence_later` | nein | Foto-/Dokumentkanal fehlt |
| `site_check_required` | nur fragmentarisch | Action und Notice-Templates vorhanden, aber kein vollständiger autonomer Lifecycle |
| `collection_sufficient_for_current_target` | teilweise | `target_readiness_reached`, derzeit Readiness-semantisch problematisch |
| `collection_paused` | Contractbegriff vorhanden, nicht sauber orchestriert | `end_collection`/Stop-Enums, Reason-Mismatch |
| `customer_cannot_answer_more` | nein | Attempts/Effort approximieren dies, aber kein explizites Outcome |
| `human_review_required` | ja | zu breit durch technische Mappingfehler |
| `domain_not_supported` | nur Takeover-Reason | kein eigener Action-/Termination-Typ |

Weitere notwendige Unterscheidung: `continue_with_other_need` ist interne Progressionsentscheidung; `leave_open`/`defer` verändern Collection State, nicht technische Wahrheit; `assumption_possible` ist ein angebotener Pfad, kein Fakt; `site_check_required` ist kein Human Review.

## Future Photo/Vision Boundary

Keine Foto-/Visionlogik wird in diesem Paket implementiert. Semantisch sollten folgende Needs später bevorzugt Evidence statt identischer Wiederholungsfrage nutzen:

| Need | geeignete spätere Evidence | zulässiger Output der Automation |
|---|---|---|
| Innenposition | Raum-/Wandfoto, Grundriss | Beobachtungen/Hypothesen, niemals finale Position |
| Außenposition | Fassade/Balkon/Garten, Grundriss | Kandidaten und Unsicherheit; Expert/Site Check bestätigt |
| Leitungsweg | zusammenhängende Foto-Serie/Grundriss mit Endpunkten | Route-Hypothese, offene Segmente |
| Elektro | Steckdose, Verteilung, Typenschild | beobachtete Merkmale; Eignung nur Regel/Experte |
| Zugänglichkeit | Gesamtansicht, Höhe/Umgebung | beobachtbare Hindernisse; sichere Ausführung nicht automatisch freigeben |
| Kondensat | Gefälle-/Ablaufumgebung | Routenhypothese, Site-Check bei Unsicherheit |
| Kernbohrung | Wandansichten/Planunterlagen | potenzielle Stelle; Statik/Leitungen nicht allein per Vision entscheiden |

Vision-Ergebnisse sind `ai_analysis`-Evidence, nie ungeprüfte bestätigte Facts. Expert-/Reviewer-Evidence kann sie korrigieren; Supersession muss Aussageart und Ziel-Proposition beachten.

## Historical Chat / Knowledge Base Boundary

Jetzt stabil zu definieren sind versionierte IDs für Need, Template, Answer-Meaning, Plannerregel und Progressionsmodell sowie kontrollierte Outcomes, Revisit-Gründe, Evidence-Semantik und Review-Trigger. Erst dann lassen sich historische Chats datensparsam auswerten: Unknown-Rate je Frage, identische/produktive Repeats, Foto-Auflösungsrate, Expertenkorrekturen je Proposition, Human-Review-Trigger je Plannerpfad und False-vs-Unknown-Fehlinterpretationen.

Lauries Fachwissen oder aus Quality Issues abgeleitete Regeln benötigen später `draft → review → approved`, Version, Gültigkeitszeitraum und Replay gegen feste Fixtures. Historische Häufigkeit darf keine Safety-Regel automatisch aktivieren. Dieses Audit implementiert weder Knowledge Base noch Metriken.

## Reference Cases

Abkürzungen: KS = Technical Knowledge State, MI = Missing Information, CS = Collection State. Alle Erwartungen beschreiben die Zielsemantik, nicht den Ist-Code.

| Fall | Initial State / relevante Answers | erwartete KS-Semantik / MI | nächster Action-Typ | Retry/Revisit | Human Review | Termination/Continuation |
|---|---|---|---|---|---|---|
| A Happy Path | Scope, Raum, Gebäude vorhanden; Kunde nennt konkrete Positionsideen, Route, Elektro, Zugang | Kundenaussagen `reported`, keine technische Bestätigung; MI nur Evidence/Offer-Details | `present_intermediate_result` oder gezielte Evidence | nein ohne neuen Gain | nein | current target sufficient; optional weiter |
| B Raumgröße unknown | Raum identifiziert; „weiß ich nicht“ | Fläche technical unknown; CS cannot answer; MI sizing | `offer_assumption` oder guided retry | ja, nur Größenklassen/Hilfe | nein | Intermediate mit Annahme/offen |
| C Elektro unknown | sonst grob vollständig; Unknown | technische Eignung unknown; MI safety/site | `request_evidence_later` oder `site_check_required` | nur mit Foto/Anschlussdaten | nein | kein Offer-Approval; Sammlung kann enden |
| D Außenposition unknown | keine Position; „Nein“ auf Wissensfrage | Position unknown; CS can specify=false | später `request_evidence_later` oder andere Need | nicht identisch | nein | offen, Intermediate möglich |
| E Außenposition technisch ungeeignet | konkrete Evidence: Kandidat nach Regel/Experte ungeeignet | technischer negativer Machbarkeitsclaim; MI alternative Position | `selected_customer_question` nach Alternative oder Review bei Hazard | ja, neuer Kandidat/Evidence | nur bei Safety/keiner Alternative | kontrolliert blockiert/site check |
| F Innenposition unknown | keine Idee | technische Position unknown; CS can specify=false | other need / Foto später | nein ohne Foto/Grundriss | nein | offen lassen |
| G Leitungsweg unknown | Endpunkte bekannt, Kunde kennt Route nicht | Route unknown; CS exhausted for context | Evidence/Site Check | nein identisch | nein | Intermediate/site check |
| H Route nach neuer Position | zuerst unknown; danach neue Innen-/Außenposition | alter CS-Context abgeschlossen; neuer Dependency-Fingerprint | konkrete Routefrage | ja: `dependency_resolved` | nein | danach normal weiter |
| I Zugänglichkeit unknown | Position bekannt; Kunde kann Höhe nicht einschätzen | technical accessibility unknown | Foto/Site Check | nur neue Evidence | nein | Site Check darf Abschluss sein |
| J Gebäudeart unknown | Kunde kann Typ nicht wählen | Klassifikation unknown; MI sizing | clarified choice/help oder leave open | maximal einmal mit Kategorien | nein | Intermediate eingeschränkt |
| K mehrere Unknowns | Außen, Route, Elektro, Zugang unknown | vier Technical MI; CS je Need ausgeschöpft | `present_intermediate_result` + Evidence-/Site-Plan | keine identischen Retries | nein | `customer_cannot_answer_more` |
| L echter Widerspruch | zwei aktive abweichende Flächenwerte | beide Claims, typed contradiction; MI resolution | correction clarification | ja: contradiction resolution | nur ungelöst/protected | keine falsche Supersession |
| M Safety Conflict | valide Evidence für gefährliche Elektro-/Montagesituation | blocked/safety conflict | `human_review_required` | nein als Kundenretry | ja | sofortiger kontrollierter Stop |
| N nur Site Check | alle Remote-Ziele erfüllt, eine sichere Vor-Ort-Prüfung offen | status requires_site_check, nicht contradiction | `site_check_required` | nein | nein | Sammlung ausreichend; Terminweg |
| O echter Human Review | Reviewer-Claim soll geändert werden oder Domain/Safety unklar | protected/blocked | `human_review_required` mit Trigger | nein | ja | Review-Task, kein automatischer Claim |
| P Customer Effort Break | vier technische Fragen, offene answerable Needs | KS unverändert außer Antworten; MI offen | `present_intermediate_result` | später nur normale neue Fragen | nein | Continue erlaubt, Counter reset |
| Q zweiter Intermediate Break | Block1→Intermediate→Continue→Block2 mit vier Fragen | Versionsinvarianten erhalten, MI neu berechnet | `present_intermediate_result` | Revisit nur Gain | nein | zweites Continue muss deterministisch erlaubt oder Owner-seitig begrenzt sein |
| R keine weiteren technischen Antworten | Kunde erklärt explizit Unfähigkeit/Abbruch | technische MI bleiben; CS global paused/exhausted | `customer_cannot_answer_more` / Evidence/Site | nein | nein | Sammlung pausiert, keine Frage-Schleife |

## Owner Decisions

| ID | Fragestellung | Varianten | technische Empfehlung | fachliche Auswirkung / Risiko | Status |
|---|---|---|---|---|---|
| OD-01 | Semantikmodell | A–E oben | E: Hybrid C + kleine D-Dimension | verhindert falsche Technical Claims; höhere Contractarbeit | `owner_required` |
| OD-02 | Progressionsmodell | global, linear, hybrid phases, graph | D mit kontrollierten Bändern | natürliche Reihenfolge, alternative Evidencepfade | `owner_required` |
| OD-03 | Bedeutung bestehender `*_known` Keys | Technical, Customer Knowledge, deprecated | keine Migration vor Bedeutungsentscheidung; wahrscheinlich deprecate/neu zuordnen | falsche Rückwärtsinterpretation | `owner_required` |
| OD-04 | Negative Answer Meaning je Template | generisch oder versionierte Semantik | versionierte per-template Answer Meaning | schützt false-vs-unknown | `owner_required` |
| OD-05 | zweites Continue | unbegrenzt je Break, begrenzt, explizite Zustimmung | explizite Zustimmung je Block; Anzahl als Produktentscheidung | WhatsApp-Länge/Abbruchrisiko | `owner_required` |
| OD-06 | Human-Review-Grenze | technischer Fallback oder fachliche Triggerliste | ausschließlich geschlossene fachliche Trigger; technische Fehler separat | verhindert Review-Überlast | `owner_required` |
| OD-07 | Site Check als Ergebnis | Action, Claimstatus, Termination | eigener fachlicher Outcome plus Technical Status | klare Safety-Grenze | `recommended` |
| OD-08 | Retrylimit 2 | entfernen, unverändert blind, plus Gain-Gate | 2 behalten + Gain-Gate/Context-Fingerprint | keine Schleifen, weiterhin deterministisch | `already_constrained_by_existing_architecture` |
| OD-09 | Readiness liest was? | alle Claims oder nur technische Propositions | ausschließlich Technical KS; CS beeinflusst Weg, nicht Wahrheit | verhindert false/unknown-Freigabe | `recommended` |
| OD-10 | Foto/Vision Assurance | direkter Claim oder Evidence+Review | Evidence/observed hypothesis, keine automatische Freigabe | Safety und Korrekturfähigkeit | `already_constrained_by_existing_architecture` |
| OD-11 | Umgang mit Text/Range bis Mapping | Human Review, leave open, block UI | kein universelles Human Review; kontrollierter unsupported/paused Pfad | Produkt darf keine Daten vortäuschen | `owner_required` |
| OD-12 | frühe Safety-Fragen | pauschal priorisieren oder Trigger-basiert | nur konkrete Hazard-Trigger dürfen Fundamentals überspringen | bessere Fachlichkeit; Risiko später Safety zu fragen | `owner_required` |

## Recommended Architecture

1. Versionierter **Information Semantic Contract**: Need, Technical Proposition, Question Intent, Answer Meaning, Entity Binding, erlaubte Evidence und Safety-Klasse.
2. Getrennter **Collection State** je Need/Entity/Context, ohne technische Wahrheit zu duplizieren.
3. Bestehender immutable **Knowledge State** bleibt Technical-Truth-Layer; Evidence wird um kontrollierte Statement Semantics ergänzt.
4. **Goal-/Dependency-Graph** mit wenigen Progressionsbändern; harte Dependencies für Route/Zugänglichkeit, deterministisches Ranking innerhalb der Eligibility.
5. **Retry/Revisit Gate** mit Max=2, Context-Fingerprint und geschlossener Gain-Taxonomie.
6. Explizite **Action-/Termination-Semantik** für Intermediate, Evidence später, Site Check, sufficient, paused, cannot-answer, Human Review und unsupported domain.
7. Human Review nur durch eine geschlossene fachliche Triggerliste; technische Pipelinefehler werden separat beobachtet und blockieren sicher, ohne fachliche Ursache vorzutäuschen.

## Recommended Implementation Packages

1. **AP-15-04-01-04 — Semantic Information and Answer Meaning Contracts**: ausschließlich Domainentscheidung/Contracts für Technical Proposition, Collection State, Evidence Semantics und alle fünf Booleans; Migrationsplan, noch keine Planner-Reihenfolge. **Kleinstes empfohlenes Folgepaket.**
2. **AP-15-04-01-05 — Knowledge/Collection Derivation and Readiness Boundary**: Mapper, Unknown/False, Missing Information, Supersession und Readiness auf dem beschlossenen Modell.
3. **AP-15-04-01-06 — Progression Graph and Dependency Eligibility**: Bänder, Goals, Innen/Außen/Route/Zugang-Dependencies, deterministische Auswahl.
4. **AP-15-04-01-07 — Retry/Revisit and Information Gain**: Context-Fingerprint, Gain-Taxonomie, no-pointless-retry.
5. **AP-15-04-01-08 — Termination, Site Check and Human Review Boundaries**: vollständige Outcomes und geschlossene Review-Trigger.
6. **AP-15-04-01-09 — Simulator Regression Fixtures and Dual Continuation Diagnostics**: Referenzfälle, Block1→Continue→Block2→Continue, Replay/Inspector; weiterhin ohne Fotoverarbeitung.
7. Später separat: Photo/Evidence Request Planning; danach erst Vision-Auswertung.

## Future Test Strategy

- Table-driven Tests für jeden Boolean Answer-Meaning-Contract: yes/no/unknown/skip/not-applicable.
- Unknown ist niemals false; Customer Knowledge ist niemals automatisch Technical Property.
- Planner-Ordering: Scope/Raum/Gebäude vor Details, außer explizitem Safety-Trigger.
- Phase-/Band- und Dependency-Eligibility, insbesondere Route benötigt Positionskontext und Zugang benötigt Montagebereich.
- Kein Retry ohne Gain-Reason oder veränderten Context-Fingerprint; zulässiger Retry nach Dependency, Foto, Grundriss, Expert-Evidence oder Hilfsvariante.
- Max zwei Attempts bleibt Invariant; Effort Break verändert Knowledge/Retry nicht.
- Intermediate Continuation und zweites Intermediate Continuation mit injizierten IDs/Zeitpunkten, Single-Click-Consumption und deterministischem Replay.
- Human Review nur für geschlossene Trigger; Mapping-/Range-Fehler, Missing-only, Photo-needed und Site-check sind negative Boundary-Tests.
- Contradiction vs explicit correction vs reviewer-protected claim; Safety Conflict separat.
- State-Version-Invarianten, idempotente Anwendung, Knowledge-State-Immutabilität und Collection-State-Immutabilität.
- Photo-ready Tests erzeugen nur Evidence-Request/Observed-Hypothesis, nie automatisch bestätigte Position/Eignung.
- Golden Replays für alle Referenzfälle mit Template-, Rule-, Planner- und Semantic-Version.

Für den Befund **`observed_but_not_deterministically_reproduced`** ist eine Fixture erforderlich, die zwei vollständige Question Blocks inklusive exakt vier technischen Fragen je Block, zwei verschiedenen Planner-Decision-IDs, unverändertem Retry State bei Continuation, State-Version vor/nach jedem Schritt sowie Button-Consumption je Intermediate festschreibt. Diagnostik sollte Continuation Eligibility, `continuationConsumed`, letzte Cycle-Statusart, Context-State-Version und ausgewählte Action-ID anzeigen; keine Roh-PII loggen.

## Production Gates

- OD-01 bis OD-06, OD-11 und OD-12 fachlich entschieden und versioniert.
- Alle aktiven Templates haben vollständige end-to-end Answer Meanings; kein planbares Template endet wegen `deferred` in Human Review.
- Readiness unterscheidet Technical Truth, Unknown, negative Property, Customer Knowledge, Preference und Site Check.
- Kein Positions-/Route-/Zugänglichkeits-Need ist ohne fachliche Dependency eligible.
- Retry benötigt Gain-Reason; Max=2 und deterministischer Replay sind getestet.
- Planner-Dead-End, Site Check, Evidence später, Pause und Human Review sind unterschiedliche Outcomes.
- Die 18 Referenzfälle sind als Regression Fixtures umgesetzt; zweites Continue ist deterministisch getestet.
- Foto/Vision darf erst nach stabiler Evidence-Semantik folgen.
- Typecheck, Lint und relevante Vitest-Suites müssen in den späteren Implementierungspaketen grün sein.

## Explicit Scope Confirmation

Dieses Paket ist ausschließlich Audit/Analyse. Es wurden **keine** Produktionslogik, Tests, Plannerregeln, Dependencies, Knowledge-/Property-/Schema-/Retry-/Review-/Template-/UI-/Simulatorregeln, Persistenz, Migrationen, SQL/RPC/RLS/Grants, Supabase-Konfiguration, KI/LLM/Vision/Foto/WhatsApp/Knowledge Base/Metriken, Preis- oder Angebotslogik geändert. `package.json` und Lockfiles bleiben unverändert. Es wurden absichtlich keine Anwendungstests ausgeführt.

**Abschlussstatus: READY FOR OWNER DECISION — NOT PRODUCTION READY.**

## AP-15-04-01-04 Semantic Information and Answer Meaning Contracts Result

### Finalisierte Ownerentscheidungen

Das freigegebene hybride Modell ist umgesetzt. `KnowledgeState` bleibt ausschließlich der technische Wahrheits- und Claim-Layer. Der neue immutable `InformationCollectionState` hält dagegen pro Information und Entity den Erhebungsstatus, die letzte kontrollierte Antwortbedeutung, höchstens zwei Attempts, Evidence-Bedarf und Revisit-Status. Attempts werden weiterhin vom bestehenden Retry State abgeleitet; Collection State führt keine eigene Retrystrategie ein.

Jede aktive kundenfähige Frage/Bestätigung besitzt einen geschlossenen `semantic_mode`. Jede Boolean-Regel besitzt explizite Bedeutungen für `yes`, `no`, `unknown` und `skip`; es existiert kein generisches Boolean→Technical-Claim-Mapping mehr. Interpretationen unterscheiden `technical_transition`, `collection_update_only`, `technical_and_collection_update`, `no_change` und `unsupported_mapping`. Interpretation und Collection-Anwendung bleiben pure und verändern ihre Inputs nicht.

### Technical Knowledge vs Collection State

Epistemische Antworten werden nicht in `KnowledgeState` gequetscht. Ein Collection-only-Ergebnis erhöht ausschließlich die Collection-Version; die Knowledge-State-Version bleibt unverändert. Technical Missing Information und Readiness werden weiterhin aus Technical Knowledge abgeleitet. `customer_does_not_know`, `customer_knows`, `leave_information_open` oder `requires_additional_evidence` erfüllen daher keinen technischen Need und erzeugen keine Readiness.

### Answer Meaning Contract und Boolean-Semantik

| Information | Semantic Mode | Ja | Nein | Unknown | Skip | Technical Claim |
|---|---|---|---|---|---|---|
| `indoor_unit_position_known` | `customer_preference` | `customer_can_provide` | `customer_does_not_know` | `leave_information_open` | `defer_collection` | keiner |
| `outdoor_unit_position_known` | `customer_knowledge` | `customer_knows` | `customer_does_not_know` | `leave_information_open` | `defer_collection` | keiner |
| `line_route_known` | `customer_knowledge` | `customer_knows` | `requires_additional_evidence` | `leave_information_open` | `defer_collection` | keiner |
| `electrical_supply_known` | `customer_observation` | `technical_true` (reported) | `customer_does_not_know` | `leave_information_open` | `defer_collection` | nur Ja |
| `accessibility_known` | `technical_property` | `technical_true` (reported) | `technical_false` (reported) | `leave_information_open` | `defer_collection` | Ja/Nein |

`accessibility_known` bleibt aus Kompatibilitätsgründen benannt wie bisher; der sichtbare Text fragt faktisch die technische Erreichbarkeit. Eine breite Property-Umbenennung ist ausdrücklich nicht Bestandteil dieses Pakets.

### Kontrollierte Textwerte

`room_type` akzeptiert ausschließlich kontrollierte deutsche Werte und mappt auf `living_room`, `bedroom`, `office`, `attic_room` oder `other`. `building_type` mappt kontrolliert auf `single_family_house`, `semi_detached_house`, `terraced_house`, `multi_family_house`, `apartment`, `commercial` oder `other`; unter anderem wird „Einfamilienhaus“ exakt auf `single_family_house` abgebildet. Normalisierung ist ausschließlich trim-/case-basiert mit expliziten Umlautvarianten; es gibt weder Fuzzy Matching noch freie Klassifikation.

Andere Textwerte bleiben `unsupported_text_mapping`. Zahlenbereiche bleiben `numeric_range_not_supported`; es wird weder gemittelt noch ein Randwert gewählt. Beide Mapping-Lücken erzeugen keinen fachlichen Human Review, verändern keinen State und verlangen einen kontrollierten Replan/alternativen Erhebungsweg. Reviewer-geschützte Claims bleiben weiterhin echter Human-Review-Fall.

### Collection State und Cycle Integration

`applyInformationCollectionOutcome` validiert streng, ersetzt genau ein gebundenes Item immutable und liefert `collection_outcome_applied` oder `collection_outcome_unchanged`. Der Conversation Cycle transportiert den Zustand und wendet Collection Outcomes nach dem unveränderten Retry Outcome an. Retry bleibt Attempts-/Historienmechanik mit Maximum zwei; Collection State bleibt semantische Wahrheit. Eine Collection-Änderung erzeugt keinen Fake-Claim und keine Knowledge-Version.

Die synthetischen Fixtures und Tests decken Außenposition Nein/Unknown/Ja, Innenposition Nein, Leitungsweg Nein, Elektro Nein, Zugänglichkeit Ja/Nein, kontrollierte Raum-/Gebäudetypen, fail-closed Text, Range ohne Human Review, Missing Information, Immutability und Cycle-Transport ab. Der Simulator verwendet den Collection State intern weiter; keine UI-Neugestaltung war erforderlich.

### Verbleibende Grenzen

Es wurden weder Planner-Reihenfolge noch Dependencies, Phasen, Progressionsgraph oder Information-Gain-Policy verändert. Offene technische Needs können nach Collection-only-Antworten mit der bisherigen Planner-/Retrymechanik weiterhin erneut auftauchen; eine kontextabhängige Revisit-Policy ist bewusst das nächste eigenständige Paket. Es gibt keine Persistenz, Datenbank-, Supabase-, Foto-, Vision-, WhatsApp-, Knowledge-Base-, Metrik-, Preis- oder Angebotslogik.

**SEMANTIC INFORMATION MODEL — IMPLEMENTED**
**ANSWER MEANING CONTRACTS — IMPLEMENTED**
**TECHNICAL KNOWLEDGE / COLLECTION STATE SEPARATION — IMPLEMENTED**
**ROOM TYPE CONTROLLED MAPPING — IMPLEMENTED**
**BUILDING TYPE CONTROLLED MAPPING — IMPLEMENTED**
**FALSE / UNKNOWN SEMANTIC SEPARATION — IMPLEMENTED**
**PLANNER PROGRESSION GRAPH — NOT IMPLEMENTED**
**INFORMATION-GAIN RETRY POLICY — NOT IMPLEMENTED**
**HUMAN REVIEW REWORK — NOT IMPLEMENTED**
**PHOTO REQUEST PLANNER — NOT IMPLEMENTED**
**VISION — NOT IMPLEMENTED**
**WHATSAPP — NOT IMPLEMENTED**
**OVERALL PRODUCT — NOT PRODUCTION READY**

## AP-15-04-01-05 Controlled Conversation Progression Result

### Progressionsmodell und Bänder

Der pure Planner verwendet jetzt einen statischen Goal-/Dependency-Graph in der geschlossenen Reihenfolge `basic_need`, `room_context`, `placement_context`, `installation_context`, `technical_clarification`. Die Bänder sind keine Screens: Sie begrenzen Auswahl und Priorität, bevor der vorhandene qualitative Score und der stabile Tie-Break innerhalb des frühesten kundenfähigen Bands wirken. Safety-/Human-Gates bleiben vorgelagert.

### Dependency Graph

Die Taxonomie ist auf `hard`, `progression` und `contextual` geschlossen. Innenposition besitzt Raumtyp als Progressions- und grobe Fläche als Kontextdependency; Außenposition Gebäudeart als Progressions- und Raumtyp als Kontextdependency. Der Leitungsweg hat harte Dependencies auf Innen- und Außenpositionskontext. Zugänglichkeit benötigt mindestens Innenpositions-/Montagekontext hart und nutzt Außenposition kontextuell. Elektro folgt dem Leitungsweg als Progressionsdependency und verdrängt deshalb nicht länger die Grundlagen. Hard Dependencies sind nicht durch Score überstimmbar; Progressions- und Contextual-Dependencies dokumentieren Reihenfolge beziehungsweise sinnstiftenden Kontext ohne eine allgemeine Rule Engine.

### Collection-aware Eligibility und Revisit Policy

`InformationCollectionState` ist Bestandteil des Planner-Inputs. `customer_does_not_know`, `customer_cannot_provide`, `skipped`, `deferred` und `requires_additional_evidence` blockieren die identische Kundenfrage, obwohl Missing Information und Readiness technisch offen bleiben. Die geschlossenen Trigger sind `new_dependency_information`, `new_customer_evidence`, `contradiction_detected` und `explicit_customer_correction`. Nur ein explizit an Need und Entity gebundener Trigger öffnet den Revisit; Plannerlauf, Zeit, Intermediate Result und Continue erzeugen keinen Trigger.

Für den konkreten Positions-/Leitungswegfall genügt **nicht**, nur nach einer erschöpften Routenfrage eine einzelne Innenposition zu beantworten. Ein zulässiger Revisit erfordert (1) erfüllten Innen- und Außenpositionskontext und (2) den expliziten Trigger `new_dependency_information` für genau den Leitungsweg und dieselbe Entity. Damit bleibt eine mit `customer_does_not_know` beziehungsweise `requires_additional_evidence` abgeschlossene Routenfrage ohne neuen Pfad gesperrt.

### Customer Effort, Intermediate und Continuation

Die Grenze von vier aufeinanderfolgenden technischen Fragen und der Intermediate Break bleiben unverändert. Continue setzt weiterhin ausschließlich den Effort-Counter kontrolliert zurück und ist kein Revisit-Trigger. Die Second-Continuation-Fixture bindet neue Decision-/Assessment-IDs und State-Versionen; nach dem zweiten Block folgt deterministisch eine echte eligible Action oder `no_eligible_customer_action`, nie eine stale Interaction oder erfundene Antwort.

### Dead End, Missing Information, Readiness und Site Check

Ein Planner Dead End heißt jetzt `no_eligible_customer_action` und trägt denselben strukturierten Reason Code; er wird nicht mehr fälschlich `customer_effort_break` genannt und löst keine künstliche Human-Review-Eskalation aus. Missing Information und Readiness bleiben ausschließlich technical-state-basiert. Collection-Progression kann daher eine Kundenfrage sperren, ohne den Technical Need oder die Readiness zu erfüllen. Bestehende Site-Check-Fallbacks bleiben verfügbar, sobald deren bisherige Retry-/Fachsemantik greift; es wurden keine Foto-, Vision- oder neuen Site-Check-Aktionen eingeführt.

### Simulator Inspector, Regression Fixtures und Tests

Der Inspector zeigt für die selektierte Action Progressionsband, Dependency Status, Collection Eligibility und Revisit Status; technische Detailobjekte bleiben im Debugmodus. Deterministische Fixtures decken Happy-Path-Reihenfolge, unbekannte/übersprungene Position und Route, Positionsdependencies, Zugänglichkeit, Elektro, gültigen Raum-/Gebäudekontext, Revisit mit/ohne Trigger, Intermediate/Continue, Second Continue, Dead End, Immutability sowie bestehende Safety-/Human-Gates ab. Adaptive Information-Gain-Optimierung, Fotoanforderungen und neue Templates bleiben außerhalb des Pakets.

**CONTROLLED PROGRESSION BANDS — IMPLEMENTED**
**STATIC DEPENDENCY GRAPH — IMPLEMENTED**
**COLLECTION-AWARE ELIGIBILITY — IMPLEMENTED**
**CONTROLLED REVISIT BASELINE — IMPLEMENTED**
**IDENTICAL RETRY WITHOUT NEW PATH — BLOCKED**
**PLANNER DEAD-END SEMANTICS — IMPLEMENTED**
**SECOND CONTINUATION REGRESSION — COVERED**
**ADAPTIVE INFORMATION-GAIN POLICY — NOT IMPLEMENTED**
**PHOTO REQUEST PLANNING — NOT IMPLEMENTED**
**VISION — NOT IMPLEMENTED**
**KNOWLEDGE BASE — NOT IMPLEMENTED**
**WHATSAPP — NOT IMPLEMENTED**
**OVERALL PRODUCT — NOT PRODUCTION READY**

## AP-15-04-01-06 Controlled Information Gain and Revisit Policy Result

### Information-Gain-Vertrag

Die Engine besitzt nun den strikt validierten, versions- und entity-gebundenen Vertrag `InformationGainAssessment`. Der Input bindet Projekt, Conversation, Information Key, Entity, Knowledge- und Collection-Version, Attempts, Collection-/Answer-Status, kontrollierte aktuelle und letzte Dependency-Signaturen, einen optionalen Revisit-Trigger und eine geschlossene Verfügbarkeit möglicher Evidence-Kanäle. Das Ergebnis enthält ausschließlich `gain_status`, `preferred_collection_path`, `revisit_allowed` und geschlossene `reason_codes`; es gibt weder freie Begründungen noch Confidence, Wahrscheinlichkeit oder fachliche Wahrheitsentscheidung.

Die Gain-Status-Allowlist lautet `new_information_expected`, `context_changed`, `no_new_information_expected`, `additional_evidence_needed`, `customer_path_exhausted`, `deferred_until_dependency`, `site_check_candidate` und `collection_complete_for_channel`. Die Collection-Path-Taxonomie lautet `customer_question`, `customer_clarification`, `existing_evidence`, `future_photo_request`, `future_document_request`, `assumption`, `site_check`, `human_review` und `leave_open`.

### Retry, Revisit und Dependency Delta

Retry bleibt derselbe Collection-Vorgang mit einer kontrolliert anderen Erhebungsstrategie. Die bestehende konkrete Raumgrößen-Retryfrage ist deshalb als `customer_clarification` zulässig. Revisit ist dagegen eine spätere Erhebung nach einem echten Kontextwechsel. `post_intermediate_progression`, Continue, Zeitablauf und ein neuer Plannerlauf reichen allein nicht. Das Maximum von zwei Attempts gilt für beide Wege und kann durch einen Revisit nicht umgangen werden.

Die pure Dependency-Delta-Prüfung betrachtet nur kontrollierte Property Keys und Zustände `missing`, `unavailable`, `available` und `sufficiently_known`. Relevant ist ausschließlich der Übergang eines kontrollierten Keys von nicht verfügbar zu verfügbar beziehungsweise ausreichend bekannt. Es gibt keine generische Object-Diff-Engine, keine Text-Hashes und keine Raw-Dumps.

Collection Items können minimal `last_dependency_signature`, `last_collection_path` und `last_gain_reason` tragen. Diese Historie enthält keine Antworten, Nachrichten, URLs, Dateien oder PII. Die Anwendung eines Collection Outcomes bleibt immutable und erkennt auch eine kontrollierte Historienänderung als Revision.

### Referenzverhalten

Beim Leitungsweg blockieren Unknown beziehungsweise `requires_additional_evidence` eine identische Wiederholung. Eine erstmals bekannte Innenposition bei weiterhin unbekannter Außenposition reicht nicht. Erst wenn beide Positionskontexte verfügbar sind, die gespeicherte Dependency-Signatur einen echten Delta nachweist und `new_dependency_information` gebunden vorliegt, darf ein Clarification-Revisit erfolgen. Es zählt weiterhin gegen das Attempt-Limit.

Innen- und Außenposition werden nach `customer_does_not_know`, Unknown oder Skip nicht identisch erneut gefragt. Für geeignete offene Positions- oder Elektro-Needs kann `future_photo_request` ausschließlich als künftiger Planungswert erscheinen. Zugänglichkeit kann nach einem echten neuen Montagekontext kontrolliert erneut klärbar werden; unveränderter Kontext reicht nicht. Elektro erzeugt weder eine Freigabe noch eine Safety-Annahme und kann bei ausgeschöpftem Kundenpfad Foto-, Site-Check- oder Leave-open-Semantik erhalten.

Fachlich bereits erlaubte Annahmen dürfen nur als `assumption`-Pfad vorgeschlagen werden; die bestehende Assumption Confirmation bleibt autoritativ. Wenn ein Need Vor-Ort-Prüfung erlaubt und kein geeigneter Kundenpfad besteht, kann `site_check` gewählt werden. Human Review ist kein Missing-/Unknown-Fallback und bleibt den bestehenden Safety-, Reviewer-Protection- und echten fachlichen Konfliktfällen vorbehalten. Ohne verfügbaren Pfad bleibt der Need mit `leave_open` technisch offen; der Planner kann andere Needs verfolgen oder kontrolliert `no_eligible_customer_action` liefern.

### Planner und Simulator

Information Gain wird nach Dependency- und Collection-Auswertung, aber vor Progressionsband-Ranking als harte Eligibility-/Path-Semantik berechnet. Ask-Actions sind nur bei `customer_question` oder `customer_clarification` zulässig. Candidate und Selected Action transportieren Gain-Status, Collection Path und Reason Codes; diese Daten sind kein Scorebonus. Der Simulator-Inspector zeigt minimal den deutsch bezeichneten Erkenntnisweg und seine kontrollierten Gründe. Es gibt keine neue Action zum Anfordern von Fotos oder Dokumenten und keinen sichtbaren Foto-Fragetext.

### Tests und verbleibende Grenzen

Fokussierte Tests decken geschlossene und strikte Schemas, Determinismus, Immutability, First Ask, Unknown/Does-not-know/Cannot-provide/Skip, Raumgrößen-Alternative, Dependency Delta, Leitungsweg mit unvollständigem und vollständigem Positionskontext, Intermediate/Continuation ohne Gain, Attempt-Maximum, Future-Photo-, Site-Check- und Leave-open-Pfade ab. Bestehende Progressions-, Safety-/Human-, Cycle-, Continuation- und Simulatorregressionen bleiben Teil der vollständigen Suite.

`future_photo_request` und `future_document_request` sind ausschließlich Domain-Planungswerte. Fotoanforderung, Upload, Medienverknüpfung, Vision, Persistenz, Datenbank, Supabase, KI/LLM, Knowledge Base, WhatsApp, Metrics sowie Preis-/Angebotslogik bleiben außerhalb dieses Pakets.

**CONTROLLED INFORMATION GAIN POLICY — IMPLEMENTED**

**RETRY / REVISIT SEMANTICS — IMPLEMENTED**

**SAME-CONTEXT IDENTICAL RE-ASK — BLOCKED**

**DEPENDENCY-DELTA REVISIT — IMPLEMENTED**

**FUTURE PHOTO COLLECTION PATH — MODELED**

**PHOTO REQUEST ACTION — NOT IMPLEMENTED**

**VISION — NOT IMPLEMENTED**

**KNOWLEDGE BASE — NOT IMPLEMENTED**

**WHATSAPP — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**

## AP-15-04-01-07 Controlled Evidence Request Planner Result

### Architecture

Der kontrollierte Evidence Request Planner ist ein reines, deterministisches Domain-Modul hinter der Information-Gain-Entscheidung. Er konsumiert ausschließlich offene Information Needs und deren geschlossenen Collection Path. Nur `future_photo_request` kann eine Fotoaktion erzeugen; `site_check`, `human_review`, normale Kundenfragen und `leave_open` bleiben eigenständige autoritative Pfade. Der Planner erzeugt weder freien Kundentext noch Technical Claims.

### Evidence Request Contracts

Die Action-Allowlist umfasst `request_photo`, `request_multiple_photos`, `request_document` und `no_evidence_request`; eine generische Dateiaktion existiert nicht. `SelectedEvidenceRequest` bindet Request-ID, Action, kontrolliertes Target beziehungsweise Bundle, Information Keys, Purpose Codes, Template, Views, Anzahlgrenzen und Reason Codes. URLs, Dateinamen, Storagepfade und Medientypen sind ausgeschlossen. `EvidenceRequestState` ist lokal, immutable, projekt-/conversationgebunden und versioniert Requests mit den Status `planned`, `requested`, `provided`, `skipped`, `declined`, `superseded` und `cancelled`.

### Target Registry, Purpose Codes und Mapping

Die statische, tief eingefrorene Registry enthält alle geprüften Targets. Für den MVP sind `room_overview`, `indoor_area_overview`, `outdoor_area_overview`, `line_route_context`, `electrical_area` und `accessibility_context` aktiv. Spezifische Wand-/Standort-/Abmessungs-, Gebäude-, Kondensat- und Kernbohrungsziele sind deferred. Jedes Target besitzt geschlossene Purposes, Views, Counts, Dependencies, Safety Constraints und `supports_information_keys`. Das Information-Key-Mapping wird explizit aus diesen kontrollierten Definitionen veröffentlicht; es gibt keine Stringnamen-Ableitung.

### Eligibility, Deduplication und Sequencing

Eligibility verlangt einen offenen Need mit `future_photo_request`, ein aktives gemapptes Target, erfüllte Dependencies, freie Request-/Effort-Kapazität sowie das Fehlen eines Human-Review- oder autoritativen Site-Check-Gates. Bereits angeforderte, abgelehnte, übersprungene, bereitgestellte oder als verfügbar markierte Evidence sperrt die unmittelbare Wiederholung. Ein kontrollierter Revisit ist im Contract vorgesehen, aber nicht automatisch aus Zeit, Continue oder erneutem Plannerlauf ableitbar. Maximal zwei aufeinanderfolgende und vier Evidence Requests im Abschnitt verhindern eine endlose Fotocheckliste.

### Bundling und Customer Effort

Mehrere offene Needs werden zuerst durch ein einzelnes Target mit breiter `supports_information_keys`-Abdeckung bedient. So kann `outdoor_area_overview` Außenposition und Zugänglichkeit gemeinsam abdecken. Beliebige dynamische Bundles sind ausgeschlossen; nur `indoor_context_bundle`, `outdoor_context_bundle` und `installation_route_bundle` sind registriert. Der aktive Innenkontext kann als kontrollierte Mehrfotoaktion geplant werden. Evidence Effort bleibt getrennt von technischen Ask-Fragen und wird nur über schmale Evidence-Counter begrenzt; das bestehende Question-Effort-Modell wurde nicht umgebaut.

### Safety und Templates

Alle Targets tragen harte Constraints gegen das Öffnen von Geräten, Leiter-/Kletterhandlungen, schwere Gegenstände und gefährliche Bereiche. Die statischen deutschen Templates bleiben neutral und enthalten keine Freigabe oder Garantie. Insbesondere fordert Elektro nur ein Foto des bekannten Umgebungsbereichs an und verbietet Öffnen oder Verändern; Zugänglichkeit verbietet die Nutzung einer Leiter.

### Simulator und Available Unanalysed Evidence

Das Domain-Simulatorcontract rendert die Überschrift „Foto benötigt“, den kontrollierten deutschen Text und die fachlichen Purpose Codes. Es stellt ausschließlich „Foto als vorhanden simulieren“, „Kann ich nicht liefern“ und „Überspringen“ bereit. Die Provided-Simulation erzeugt kein Bild, sondern setzt den lokalen Request auf `provided` und die Availability auf `available_unanalysed`. Decline und Skip lösen den Request kontrolliert, ohne den Technical Need zu schließen.

### Planner-/Cycle-Integration und Readiness Boundary

Der Evidence Planner liefert den eigenständigen Resulttyp `evidence_request_selected` mit Request, Rendering und lokal weiterführbarem State-Contract; die normale Question-Action kann keine Fotoaktion erfinden. Die Integration ist als kontrollierte Delegationsgrenze `Missing Need → Information Gain → future_photo_request → Evidence Request Planner` verfügbar. Unanalysierte Evidence verändert weder `KnowledgeState` noch Missing Information oder Readiness. Eine spätere, ausdrücklich nicht implementierte Interpretation müsste zuerst einen kontrollierten Technical Claim erzeugen.

### Human Review, Site Check und Document Boundary

Human Review und ein autoritativer Site Check blockieren Evidence Requests hart. Ein Foto ersetzt diese Pfade nicht. `request_document` bleibt Teil der geschlossenen Action-Taxonomie, aber es existieren weder aktive Dokumenttargets noch Templates oder Simulatorcontrols, weil das aktuelle MVP keinen hinreichend konkreten dokumentbasierten Need besitzt.

### Tests und verbleibende Grenzen

Fokussierte Vitest-Szenarien prüfen strikte Schemas, Registry/Mapping/Immutability, alle aktiven MVP-Ziele, Dependencies, Human Review, Site Check, Effort, Deduplication, vorhandene unanalysierte Evidence, Multi-Need-Abdeckung, kontrolliertes Bundling, Safety-Texte, Simulatorcontrols, unverändertes Knowledge und den deferred Dokumentpfad. Es wurden keine Dependency-, Package-, Datenbank- oder Medienänderungen eingeführt.

**CONTROLLED EVIDENCE REQUEST PLANNER — IMPLEMENTED**

**PHOTO REQUEST DOMAIN ACTION — IMPLEMENTED**

**PHOTO REQUEST TEMPLATE REGISTRY — IMPLEMENTED**

**PHOTO REQUEST DEDUPLICATION — IMPLEMENTED**

**PHOTO SAFETY CONTRACT — IMPLEMENTED**

**SYNTHETIC EVIDENCE AVAILABILITY — IMPLEMENTED**

**REAL PHOTO UPLOAD — NOT IMPLEMENTED**

**PROJECT MEDIA BINDING — NOT IMPLEMENTED**

**VISION ANALYSIS — NOT IMPLEMENTED**

**DOCUMENT REQUESTS — DEFERRED / NOT IMPLEMENTED**

**WHATSAPP MEDIA COLLECTION — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**

## AP-15-04-01-08 Evidence Request Conversation Orchestration Result

### Cycle Integration und Result Contract

Der pure Conversation Cycle delegiert nach einem `no_eligible_customer_action` ausschließlich dann an den bestehenden Evidence Request Planner, wenn die bestehenden Information-Gain-Candidates einen offenen `future_photo_request`-Pfad ausweisen. Eine erfolgreiche Delegation liefert `cycle_status: evidence_request_selected` sowie `selected_evidence_request` und `rendered_evidence_request`; Question Ranking und Evidence Ranking bleiben getrennt. Ein nicht zulässiges Target führt kontrolliert zum bestehenden Collection Stop und erfindet weder Target noch freien Requesttext.

### Evidence Request State, Effort und Continuation

`EvidenceRequestState` und Evidence Availability werden als explizite, projekt-/conversationgebundene Zustände neben Knowledge, Collection, Retry und Customer Effort durch Cycle, Simulator und Continuation transportiert. Der Initialzustand ist strikt leer (`revision: 0`, `requests: []`). Der Cycle verwendet die bestehende Evidence-Deduplizierung und deren Grenzwerte von höchstens zwei aufeinanderfolgenden beziehungsweise vier gesamten Evidence Actions; technische Fragen-Counter werden dadurch nicht erhöht. Continue bewahrt Request-Historie und Availability unverändert.

### Simulator UI, Transcript und Inspector

Der Simulator zeigt einen Evidence Request als getrennte Karte „Foto benötigt“ mit kontrolliert gerendertem Text, erwarteter Fotoanzahl und ausschließlich den erlaubten Aktionen „Foto als vorhanden simulieren“, „Kann ich nicht liefern“ und „Überspringen“. Transcript-Einträge unterscheiden Fotoanforderung und synthetische Fotoantwort von Systemfrage und Testerantwort. Der Inspector zeigt Target, Status, unterstützte offene Informationen, Availability und Attempts; technische IDs erscheinen nur im Debugmodus. Die Pipeline nennt Evidence Planning sowie Evidence Response/Replanning ausdrücklich und enthält keinen Vision-Schritt.

### Provided / Declined / Skip, Replay und Events

Provided setzt ausschließlich den Request auf `provided` und Availability auf `available_unanalysed`; die Standardansicht bezeichnet dies als „Foto vorhanden – noch nicht ausgewertet“. Declined und Skip setzen ausschließlich `declined` beziehungsweise `skipped`. Alle drei Outcomes lassen den Technical Need offen und blockieren durch die bestehende Request-Historie eine unmittelbare identische Wiederholung. Simulator Inputs unterscheiden `customer_answer` und `evidence_response`; IDs und Zeitpunkte bleiben injiziert und gemischte Replay-Schritte deterministisch. Die bestehende Cycle-Completion-Eventfolge trägt den neuen Resultcode; Medien-/Uploadevents wurden nicht ergänzt.

### Readiness und Missing Information Boundary

Auswahl und synthetische Bereitstellung erzeugen keinen Claim, keine Evidence Reference an einem Claim, keine Knowledge-Version und keinen Readiness-Fortschritt. `available_unanalysed` ist nur Verfügbarkeit, keine technische Interpretation. Missing Information bleibt bis zu einer späteren kontrollierten Evidence Interpretation bestehen.

### Human Review, Site Check und Errors

Bestehende Human-Review-Gates bleiben vor Evidence Planning autoritativ. Nur `future_photo_request`, niemals `site_check`, kann den Evidence Planner aktivieren. Geschlossene Orchestrierungs-/Response-Codes decken ungültigen Kontext, Planning-/Rendering-/Invariantfehler sowie ungültige, inaktive und bereits gelöste Responses ab; technische Fehltexte werden nicht als freie UI-Ausgabe verwendet.

### End-to-End Fixtures, Tests und Validation

Fokussierte Cycle-/Simulatorfixtures prüfen den Übergang von unbekannter Position über Information Gain und kontrolliertes Target zu `evidence_request_selected`, alle drei synthetischen Outcomes, `available_unanalysed`, unverändertes Knowledge/Readiness/Missing Information, geschlossene Response-Fehler und deterministische Zustandsübergänge. Registrytests decken Innen-/Außenposition, Leitungsweg-Dependencies, sichere Elektroanforderung, Zugänglichkeit, Multi-Need-Coverage, Effort, Human Review, Site Check und fehlende zulässige Targets ab. Vollständige Typecheck-, Lint-, Test- und Buildvalidierung wird im Abschlussbericht mit echtem Exitcode ausgewiesen.

**EVIDENCE REQUEST CONVERSATION ORCHESTRATION — IMPLEMENTED**

**EVIDENCE REQUEST SIMULATOR FLOW — IMPLEMENTED**

**SYNTHETIC PROVIDED / DECLINED / SKIP — IMPLEMENTED**

**AVAILABLE UNANALYSED EVIDENCE FLOW — IMPLEMENTED**

**EVIDENCE REQUEST REPLAY — IMPLEMENTED**

**REAL PHOTO UPLOAD — NOT IMPLEMENTED**

**PROJECT MEDIA BINDING — NOT IMPLEMENTED**

**VISION ANALYSIS — NOT IMPLEMENTED**

**WHATSAPP MEDIA COLLECTION — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**
