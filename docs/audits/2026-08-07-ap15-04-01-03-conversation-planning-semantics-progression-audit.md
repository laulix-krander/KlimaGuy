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
