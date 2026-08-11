# AP-15-04-01-09 — Controlled Evidence Interpretation Architecture and Safety Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-11-AP15-04-01-09-CONTROLLED-EVIDENCE-INTERPRETATION-V1` |
| Datum | 2026-08-11 |
| Audit-Branch | `codex/audit-ap15-04-01-09-evidence-interpretation` |
| Baseline-Branch | `work` |
| Baseline-HEAD | `b1f6f3deeea9340936241a9dd200b5fce4ca81f5` |
| Remote Status | Kein Git-Remote konfiguriert; Remote-Abgleich und Ahead/Behind-Bewertung sind nicht möglich. |
| Verbindliche Grundlage | Vollständiger AP-15-04-01-03-Audit einschließlich Result-Abschnitten AP-15-04-01-04 bis AP-15-04-01-08 sowie die aktuelle Domain unter `lib/domain/conversation-intelligence/**` |
| Auditstatus | **READY FOR OWNER DECISION** |
| Produktionsstatus | **NOT PRODUCTION READY** |

**Baseline:** sauberer Worktree auf `work` bei `b1f6f3deeea9340936241a9dd200b5fce4ca81f5`; anschließend wurde ausschließlich der Audit-Branch angelegt. Die Ist-Analyse bestätigt die Actor-Klassen `customer`, `admin`, `reviewer`, `system`, `ai`, die Evidence-Quellen einschließlich `project_media`, `ai_analysis` und `reviewer_correction` sowie die epistemischen Status `confirmed`, `reported`, `observed`, `estimated`, `assumed`, `unknown`, `not_applicable`, `contradicted`, `requires_site_check`.

## 2. Scope

Dieses Paket ist ausschließlich Audit, Analyse, Architektur-, Domain-, Safety-, Test- und Dokumentationsplanung. Es beantwortet, welche kontrollierten Aussagen eine Evidence-Quelle später liefern darf, welchen epistemischen Status diese tragen, welche Safety-Grenzen gelten und wann eine Observation überhaupt Kandidat für ein `KnowledgeClaimProposal` werden darf.

Nicht Gegenstand sind Implementierung, Vision/AI-Ausführung, OCR, Medienzugriff, Upload, Project-Media-Bindung, Claim-Erzeugung, State-Mutation, UI, Simulatoränderung, Persistenz, Datenbank, Supabase, WhatsApp, Knowledge Base, Metrics und Tests. Auch dieses Dokument führt keine neue fachliche Wahrheit ein.

## 3. Current Evidence Pipeline

Der implementierte Pfad lautet:

`Technical Need` → `InformationGainAssessment` → `future_photo_request` → kontrollierter `Evidence Request` → synthetisch `provided` → `available_unanalysed`.

Aktive Targets sind `room_overview`, `indoor_area_overview`, `outdoor_area_overview`, `line_route_context`, `electrical_area` und `accessibility_context`. Availability bindet derzeit Target, Status und optional Request-ID, aber kein reales Asset. `available_unanalysed` ist ausschließlich Verfügbarkeit. Korrekt entstehen daraus **kein Claim, keine Knowledge-State-Version, keine Readinesssteigerung und keine technische Freigabe**. `analysed` existiert als Availability-Wert, besitzt aber noch keine Interpretationsemantik.

Die vorhandene Claim-Pipeline ist bereits autoritativ: kontrollierte Evidence-/Knowledge-Claim-Proposals → `StateTransitionProposal` → immutable, versionsgebundene Anwendung. Reviewer-Evidence und manuelle Korrekturen sind vor unkontrollierter Supersession geschützt; Widersprüche bleiben parallel erhalten. Diese Mechanismen sind wiederzuverwenden, nicht zu duplizieren.

## 4. Terminology

| Begriff | Exakte Bedeutung | Harte Abgrenzung |
|---|---|---|
| **Raw Evidence** | Unverarbeiteter Inhalt einer Quelle, etwa Bildbytes, bevor Domain-Interpretation erfolgt. | Gehört nicht in Conversation-Intelligence-Contracts; ist weder Asset-Metadatum noch Observation. |
| **Evidence Asset** | Opaque, adressierbare fachliche Repräsentation eines bereitgestellten Mediums mit IDs und Bindung, ohne Bytes oder Storage-Ort. | Beweist keine Aussage und ist nicht `EvidenceReference` eines Claims. |
| **Evidence Availability** | Lifecycle-Aussage, ob angeforderte Evidence nicht angefragt, angefragt, unanalysiert verfügbar, analysiert, ungültig oder unbrauchbar ist. | Keine Qualitäts-, Beobachtungs- oder Wahrheitsaussage. |
| **Evidence Observation** | Immutable, eng typisierte Aussage darüber, was innerhalb eines gebundenen Evidence-Scopes sichtbar beziehungsweise nicht ausreichend sichtbar ist. | Keine technische Eignung, Hypothese, Freigabe oder State-Mutation. |
| **Evidence Interpretation** | Deterministischer Vorgang, der Asset, Target/Purpose und Actor-Output validiert und daraus Observations/Hypothesen klassifiziert. | Nicht gleich Vision-Ausführung und nicht gleich Claim-Anwendung. |
| **Evidence Hypothesis** | Kontrollierte, widerrufbare Möglichkeit, die über unmittelbar Sichtbares hinausgeht, z. B. mögliche Montagefläche. | Nicht `confirmed`; ohne Mapping/Gate keine Claim-Wirkung. |
| **Technical Claim Proposal** | Noch nicht angewendeter, schema- und registrykonformer Vorschlag über eine existierende technische Property mit Evidence und Epistemik. | Kein Claim im Knowledge State und keine zweite Claim Engine. |
| **Confirmed Technical Claim** | Von der bestehenden Transition-Pipeline angewendeter Claim mit `confirmed`, dessen erlaubte Bestätigungskette erfüllt ist. | „Angewendet“ allein heißt nicht automatisch `confirmed`; AI-Observation darf diesen Status nicht verleihen. |
| **Human Reviewer Finding** | Observation, Hypothese oder technische Beurteilung eines autorisierten `reviewer`/`admin`/künftigen Expert-Rollenmappings. | Ist erst nach kontrolliertem Mapping ein Claim; Reviewer-UI-Aktion allein mutiert nichts. |
| **Vision Finding** | Schmaler, geschlossener Adapter-Output eines Actors `ai`, der Observation oder erlaubte Hypothese meldet. | Kein freier Bericht, kein Reviewer Finding und keine autoritative technische Wahrheit. |
| **Evidence Quality** | Qualitative Klasse der Nutzbarkeit eines Assets für die konkrete Observation. | Keine Prozentzahl, Confidence oder Sufficiency für einen Claim. |
| **Evidence Sufficiency** | Regelentscheidung, ob definierte Evidence/Observations für einen bestimmten Mapping-Schritt ausreichen. | Immer Target-/Observation-/Property-spezifisch; nicht global vom Foto ableitbar. |
| **Evidence Conflict** | Kontrolliert erkannte Unvereinbarkeit zwischen Observations, zwischen Evidence und Aussage oder zwischen daraus entstehenden Claims. | Keine automatische Auflösung oder stille Überschreibung. |
| **Evidence Invalidity** | Evidence ist außerhalb des zulässigen Vertrags, unlesbar/korrupt, falsch gebunden oder aus Privacy-/Safety-Gründen nicht interpretierbar. | Nicht bloß geringe Qualität; erzeugt keine technische Annahme. |
| **Evidence Scope** | Gebundener Ausschnitt aus Projekt, Conversation, Entity, Target, Purpose und gegebenenfalls Need, für den eine Observation gilt. | Keine Generalisierung auf andere Räume, Positionen oder Projekte. |
| **Evidence Target** | Geschlossener Aufnahmekontext, z. B. `outdoor_area_overview`. | Nicht die technische Property und nicht automatisch das tatsächlich sichtbare Motiv. |
| **Evidence Purpose** | Geschlossener Erhebungszweck, z. B. `evaluate_outdoor_position_context`. | Erlaubt nur Prüfung, garantiert aber weder Beobachtung noch Ergebnis. |

## 5. Architecture Variants

Bewertung: 1 = schwach/hohes Risiko, 5 = stark; bei MVP-Komplexität bedeutet 5 = einfach.

| Kriterium | A: Vision → Claim | B: Observation → Mapping | C: Obs.+Hyp., immer Reviewer | D: Regeln + Property-Gate | E: Hybrid Registry + Safety + optional Gate |
|---|---:|---:|---:|---:|---:|
| Sicherheit | 1 | 3 | 5 | 4 | 5 |
| Fachliche Wahrheit | 1 | 3 | 4 | 4 | 5 |
| Testbarkeit | 2 | 5 | 4 | 5 | 5 |
| Explainability | 1 | 5 | 4 | 5 | 5 |
| Vision-Unabhängigkeit | 1 | 5 | 4 | 5 | 5 |
| Human Review gezielt | 1 | 3 | 2 | 4 | 5 |
| Laurie-Workflow | 1 | 3 | 5 | 4 | 5 |
| Widersprüche | 1 | 4 | 4 | 5 | 5 |
| Supersession | 1 | 4 | 4 | 5 | 5 |
| Mehrere Fotos | 2 | 4 | 4 | 5 | 5 |
| Schlechte Fotos | 1 | 4 | 4 | 5 | 5 |
| Historische Chats | 1 | 4 | 3 | 4 | 5 |
| Knowledge Base anschließbar | 1 | 4 | 3 | 4 | 5 |
| WhatsApp anschließbar | 2 | 4 | 3 | 4 | 5 |
| MVP-Komplexität | 5 | 4 | 2 | 3 | 3 |

- **A verwerfen:** Ein probabilistischer/visueller Befund würde Domain- und Safety-Gates umgehen, technische Eignung vortäuschen und die bestehende Transition-Autorität verletzen.
- **B** schafft die wichtigste Entkopplung, besitzt allein aber keine Property-Safety-Klassen und keinen kontrollierten Reviewerpfad.
- **C** ist sicher, macht aber jedes Bild zum manuellen Arbeitskorb und verhindert ein wirtschaftliches Laurie-MVP.
- **D** ist belastbar, solange Regeln wirklich statisch sind; ohne getrennte Hypothesen-/Observationsemantik droht dennoch Begriffsvermischung.
- **E empfehlen:** kontrollierte Observations, getrennte Hypothesen, statische Property-spezifische Mapping Registry, qualitative Sufficiency, Safety Classification und optionales Human Gate. E verbindet B und D und erlaubt C nur dort, wo Risiko es verlangt.

## 6. Recommended Architecture

Empfohlener autoritativer Pfad:

`Evidence Request` → `Evidence Asset (opaque)` → `Evidence Observation` → `Interpretation Registry` → optional `Evidence Hypothesis` → `Claim Mapping Registry` → optionales Reviewer Gate → bestehendes `EvidenceProposal`/`KnowledgeClaimProposal` → bestehender `StateTransitionProposal` → bestehende State Transition.

Prinzipien:

1. Vision und Mensch liefern keine Knowledge-State-Mutation, sondern schmale Findings.
2. Eine Observation wird immutable gespeichert beziehungsweise im Domainlauf transportiert; Korrektur erzeugt eine neue Observation mit expliziter Supersession, nie In-place-Edit.
3. Nur eine statische, build-time definierte Registry darf `(observation_type, target, entity, property)` verbinden. Keine freie Property, Runtime Registry oder DB-Regel.
4. Sufficiency und Review Class sind Eigenschaften der konkreten Mapping-Regel, nicht des Actors allein.
5. Ein AI-Befund kann höchstens eine erlaubte Proposal-Kette anstoßen; `confirmed`, Reviewerstatus oder Site-Check-Ersatz sind ausgeschlossen.
6. Die bestehende Claim-/Contradiction-/Supersession-/Readiness-Pipeline bleibt allein autoritativ.

## 7. Evidence Observation Contract

Der nächste Domainvertrag soll strikt, readonly, versioniert und ohne freie Objektfelder geplant werden:

| Feld | Geplanter Typ / Regel |
|---|---|
| `observation_id` | UUID; eindeutige immutable Identität |
| `contract_version` | positive Integer-Allowlist; keine Mutation alter Semantik |
| `evidence_id` | opaque UUID; genau ein Ursprungsasset |
| `project_id` / `conversation_id` | UUIDs; müssen Scope und Request-Bindung entsprechen |
| `entity_type` / `entity_id` | bestehende geschlossene Entity-Klasse plus UUID |
| `target_key` | bestehender aktiver `EvidenceTargetKey`; Observation muss dafür erlaubt sein |
| `purpose_codes` | nichtleere Teilmenge der gebundenen Request-Purposes |
| `observation_type` | geschlossene MVP-Allowlist |
| `observation_value` | geschlossene discriminated union pro Type, bevorzugt `present`/`not_visible`/klassifizierte Lage; **kein beliebiges JSON und kein Freitext** |
| `source_actor_class` | bestehend `ai`, `reviewer` oder `admin`; `system` nur für deterministisch abgeleitete Meta-Observations, nicht für Gesehenes |
| `observed_at` | Offset-Timestamp; fachlicher Beobachtungszeitpunkt |
| `evidence_quality` | geschlossene qualitative Klasse |
| `interpretation_status` | vorgeschlagen: `recorded`, `superseded`, `invalidated`, `review_required`, `reviewed`; nicht mit Availability vermischen |
| `scope` | striktes Objekt aus Request-ID, Entity-Bindung und optional kontrolliertem View-Key; keine Koordinaten/Freitexte |
| `reason_codes` | geschlossene, type-/quality-spezifische Allowlist |
| `supersedes_observation_id` | optional; nur kontrollierte Korrektur/bessere Evidence, gleiche fachliche Scope-Kompatibilität |
| `idempotency_key` | deterministisch aus Evidence-ID, Contract-Version, Actor-Run-ID und Observation-Key; keine Bild-/Textdaten |

Ausgeschlossen: Chain-of-Thought, Prompts, freie Begründung, Base64, Bytes, URL, Signed URL, Storagepfad, Dateiname, Providerantwort, Kundentext, EXIF, GPS und PII. `EvidenceObservation` ist nicht dasselbe wie die vorhandene claimgebundene `EvidenceReference`; erst ein erlaubter Proposal-Mapper erzeugt letztere.

## 8. Observation Types

Empfohlene geschlossene MVP-Allowlist:

| Klasse | Observation Types | Einordnung / Claimfähigkeit |
|---|---|---|
| Unmittelbar sichtbar | `room_overview_visible`, `wall_area_visible`, `window_visible`, `door_visible`, `outdoor_area_visible`, `line_route_context_visible`, `electrical_connection_visible`, `electrical_panel_exterior_visible`, `accessibility_context_visible`, `obvious_access_obstacle_visible`, `measurement_reference_visible` | Auto-observable; nur sichtbare Präsenz/Kontext, grundsätzlich kein technischer Eignungsclaim. |
| Kontrollierte Hypothesen-Nähe | `possible_indoor_mounting_area_visible`, `possible_outdoor_mounting_area_visible` | Darf von AI als Hypothesen-Kandidat markiert werden, nicht als technische Eignung. Claim mapping im ersten MVP besser reviewerpflichtig oder deaktiviert. |
| Qualitäts-/Negativbefund | `image_insufficient`, `image_obstructed`, `image_wrong_area` | Keine technische Claimfähigkeit; steuert später Better-Evidence-Verhalten. |

Noch **nicht** in die MVP-Allowlist: `wall_penetration_context_visible` (zu hohe Verwechslungsgefahr mit Bohrfreigabe), `condensate_route_context_visible` (kein aktives Target/keine belastbare Semantik) und generische freie Objekt-/Material-/Dimensionsbefunde. Sie benötigen ein eigenes Audit oder spätere Registry-Erweiterung.

Explizite Safety-Nichtabbildungen:

- `possible_outdoor_mounting_area_visible` ≠ `outdoor_position_technically_approved = true`.
- `electrical_connection_visible` ≠ `electrical_supply_suitable = true`.
- `wall_area_visible` ≠ `core_drilling_safe = true`.
- `line_route_context_visible` ≠ `line_route_feasible = true`.
- „sichtbar“ ≠ „vollständig“, „maßhaltig“, „zugelassen“, „normgerecht“, „tragfähig“ oder „sicher“.

## 9. Evidence Quality

Empfohlene qualitative Allowlist:

| Quality | Bedeutung | Erlaubte Folge |
|---|---|---|
| `sufficient_for_observation` | Der Scope erlaubt genau die benannte Observation. | Observation darf aufgezeichnet werden; Claim-Sufficiency separat prüfen. |
| `partially_sufficient` | Nur ein abgegrenzter Teil ist beobachtbar. | Nur passende Teilobservation; keine Vollständigkeitsannahme. |
| `insufficient` | Zielmerkmal nicht belastbar beobachtbar. | `image_insufficient`, später Better Evidence; kein Claim. |
| `wrong_target` | Motiv passt nicht zum gebundenen Target. | `image_wrong_area`; kein Cross-Target-Remapping. |
| `obstructed` | Relevanter Bereich verdeckt. | `image_obstructed`; nur andere klar sichtbare Allowlist-Merkmale möglich. |
| `ambiguous` | Mehrere Interpretationen bleiben möglich. | Hypothese oder Review, nie technischer Claim automatisch. |
| `invalid` | Contract-/Asset-/Privacy-/Formatgrenze verletzt. | Interpretation stoppen; keine Observation außer Invaliditätsresultat. |

Keine Confidence-Zahlen, Prozentwerte oder Vision-Scores. **Sufficiency ist eine zweite Entscheidung:** `wall_area_visible` kann `sufficient_for_observation` sein und dennoch für jede Property über Kernbohrung `insufficient` bleiben. Jede Mapping-Regel definiert minimal zulässige Quality, erforderliche Observation-Kombination, Actor-/Review-Klasse und Ausschlussgründe.

## 10. Observation vs Hypothesis

| Stufe | Beispiel | AI automatisch? | Regelbasiert weiter? | Human Review |
|---|---|---|---|---|
| **Observation** | „Fenster sichtbar“ | Ja, bei erlaubtem Target und ausreichender Quality. | Ja, aber nur zu explizit erlaubtem Proposal oder Collection-Metadatum. | Nicht generell. |
| **Hypothesis** | „Diese Wand könnte grundsätzlich Platz bieten.“ | Nur als separater, geschlossener Hypothesencontract; niemals als Observation tarnen. | Darf Review/weitere Evidence auslösen; automatische technische Anwendung im MVP nein. | Bei claimfähiger technischer Folge erforderlich. |
| **Technical Assessment** | „Montageposition fachlich geeignet.“ | Nein. AI ist kein Reviewer. | Keine automatische Ableitung aus Bildobservation. | Reviewer/Expert und je nach Property trotzdem Site Check. |

Echte sichtbare Merkmale verwenden `observed`. Kundenangaben bleiben `reported`. Hypothesen sollen einen separaten Contract tragen; falls später ein Claim Proposal zulässig wird, höchstens `estimated`, niemals automatisch `confirmed`. `assumed` bleibt kontrollierten Annahmen, `requires_site_check` fachlichen Vor-Ort-Grenzen vorbehalten. Es wird keine neue Confidence-Dimension eingeführt.

## 11. Target-specific Interpretation

| Target | Erlaubte Observations | Nicht ableitbar | Potenziell unterstützte Information | Zulässige Claims im sicheren MVP | Review / Site Check |
|---|---|---|---|---|---|
| `room_overview` | Raumkontext, Fenster, Türen, Wandflächen sichtbar; insuffizient/verdeckt/falsch | exakte Fläche, Last, Gerät, Montagefreigabe | Kontext zu `room_area_sqm`, Positionserhebung | zunächst keine Dimensionsclaims; höchstens später „room overview observed“ falls Property existiert | Maße/Last nicht aus unkalibriertem Foto; finale Planung Site Check/Expert |
| `indoor_area_overview` | Wandbereich, angrenzende Tür/Fenster, mögliche freie Fläche | Statik, Befestigung, Bohrsicherheit, finale Position | `indoor_unit_position_known` nur als Kontext/Hypothese | keine automatische technische Eignung; reviewergebundener Positionsvorschlag später denkbar | technische Position Review; Statik/Bohrung Site Check |
| `outdoor_area_overview` | Boden-/Wandbereich, Umgebung, mögliche Fläche, offensichtliches Hindernis | Schall-/Nachbarrecht, Statik, Kondensatgesamtweg, finale Freigabe | Außenpositions-/Zugänglichkeitskontext | keine automatische Freigabe; sichtbares Hindernis könnte später negativen, reviewerpflichtigen Proposal stützen | Position Review; Recht/Statik/Finalfreigabe Site Check |
| `line_route_context` | Innen-/Außenbezug, Ecken/Wege, offensichtliche Hindernisse | kompletter/ausführbarer Weg, verdeckte Leitungen, Bohrsicherheit | `line_route_known` als Kontext | keine automatische Machbarkeit; Observation bleibt beobachtet | Machbarkeit Review; verdeckte Infrastruktur/Bohrung Site Check |
| `electrical_area` | Anschluss/Steckdose oder Verteiler äußerlich sichtbar | Stromkreis, Absicherung, Dimensionierung, Normkonformität, Eignung | nur sichtbarer Elektro-Kontext | **keine automatischen technischen Elektroclaims im MVP** | Eignung Human Review plus regelmäßig Site Check/Elektrofachprüfung |
| `accessibility_context` | Bodenhöhe-Kontext, offensichtliche Höhe/Hindernisse/freie Fläche | sichere Leiterarbeit, Gerüstfreiheit, Zugangstechnikfreigabe | `accessibility_known` als grober Kontext | nur nicht-sicherheitskritischer sichtbarer Kontext; „Montage normal zugänglich“ nicht automatisch | Ambiguität/ungewöhnliche Höhe Review; sichere Arbeitsmethode Site Check |

## 12. Room Overview

Zulässig sind `room_overview_visible`, sichtbare Fenster/Türen/Wandflächen sowie grober Nutzungskontext nur dann, wenn dieser künftig als geschlossene Kategorie definiert wird. Ein Weitwinkelbild kann für diese Observations genügen, aber ohne kontrollierte Messreferenz niemals exakte Raumfläche liefern. Selbst mit Messreferenz bleiben Perspektive, verdeckte Geometrie und Raumhöhe getrennte Sufficiency-Fragen.

Unzulässig sind automatische Wärme-/Kühllast, endgültige Geräteauswahl, Montagefreigabe und die Behauptung vollständiger Raumgeometrie. Der bestehende Need `room_area_sqm` bleibt offen, bis eine dafür ausdrücklich erlaubte Claim-Quelle durch die bestehende Pipeline angewendet wurde.

## 13. Indoor Area

Zulässig: sichtbarer Wandbereich, angrenzende Fenster/Tür, optisch freier Bereich und als **Hypothese** eine mögliche Fläche. „Frei“ bezieht sich ausschließlich auf sichtbare Oberflächen, nicht auf Wandaufbau oder verdeckte Infrastruktur.

Unzulässig: statische Eignung, Befestigungsfestigkeit, exakte Leitungsführung, Kernbohrungssicherheit, Abstände ohne Messgrundlage und finale Montageposition. `possible_indoor_mounting_area_visible` darf im MVP keinen automatisch angewendeten Claim erzeugen.

## 14. Outdoor Area

Zulässig: sichtbarer Boden-/Wandbereich, Umfeld, mögliche Stell-/Hängefläche als Hypothese und offensichtliche Zugangsbarriere. Scope muss den konkreten Standort unterscheiden; „links“ ohne gebundene Perspektive ist kein stabiler Identifier.

Unzulässig: Einhaltung von Schallschutz oder Nachbarschaftsrecht, Statik, Wind-/Wettertauglichkeit, vollständige Kondensatlösung und endgültige Positionsfreigabe. Keine Bildmenge kann diese Grenzen allein überwinden.

## 15. Line Route

Zulässig: sichtbare Innen-/Außenbezüge, Ecken, Wegekontext und offensichtliche Hindernisse. Mehrere Perspektiven können komplementäre Observations bilden, beweisen aber nicht automatisch einen lückenlosen Weg.

Unzulässig: vollständiger Leitungsweg, technische Ausführbarkeit, gefahrlose Kernbohrung, Ausschluss verdeckter Leitungen, zulässige Leitungslänge oder Kondensatgefälle. `line_route_context_visible` bleibt Observation und darf nicht direkt `line_route_known=true` als technische Machbarkeit erzeugen.

## 16. Electrical

Das Target ist besonders restriktiv. Zulässig sind nur `electrical_connection_visible` und `electrical_panel_exterior_visible` sowie Qualitätsbefunde. Geräte/Verteilungen dürfen weder geöffnet noch verändert werden; Labels, personenbezogene Markierungen und Seriennummern sollen nicht in Domaincontracts übernommen werden.

**Empfehlung:** Im MVP sind alle automatischen technischen Claims aus `electrical_area` verboten. Sichtbarkeit einer Steckdose sagt nichts über eigenen Stromkreis, Absicherung, Leiterquerschnitt, Schutzmaßnahmen, Belastbarkeit oder Normkonformität. `electrical_supply_known` darf dadurch nicht auf `true` gesetzt werden. Elektrische Eignung verlangt Elektrofachprüfung beziehungsweise Site Check; ein Reviewer kann höchstens den weiteren Prüfpfad klassifizieren.

## 17. Accessibility

Zulässig: offensichtlicher Bodenhöhenkontext, sichtbare Höhenklasse nur bei geschlossener qualitativer Definition, Hindernisse und freie Zugangsfläche. Nicht zulässig: sichere Leiterarbeit, „kein Gerüst erforderlich“, sichere Tragfähigkeit des Standorts oder Montage ohne besondere Zugangstechnik.

Ein späterer begrenzter Claim könnte lauten, dass ein **offensichtliches Hindernis sichtbar** ist (`observed`), nicht dass der Montagebereich insgesamt unzugänglich oder sicher zugänglich ist. Ambiguität, ungewöhnliche Installationen und arbeits-sicherheitsrelevante Folgerungen benötigen Review/Site Check.

## 18. Multiple Evidence

Empfohlen wird zunächst ein **Observation Set**, kein Evidence Set als neue Wahrheitsinstanz. Es referenziert immutable Observation-IDs, Scope, Target, Entity und eine Registry-Version; es kopiert keine Observations und trägt keine globale `complete`-Flagge. Ein Set ist eine kontrollierte Eingabe in eine konkrete Sufficiency Rule.

Regeln:

1. Jede Observation bleibt auf genau ein `evidence_id` zurückführbar.
2. Mehrere Bilder dürfen komplementäre Sichtbereiche belegen; Anzahl allein erzeugt nie Vollständigkeit.
3. Aggregation ist nur innerhalb kompatibler Projekt-/Conversation-/Entity-/Target-Scope-Bindungen zulässig.
4. Cross-Target-Beobachtungen werden nicht still umgebucht.
5. Sufficiency nennt die tatsächlich verwendeten Observation-IDs; fehlende Pflichtansichten bleiben fehlend.
6. Duplikate erhöhen weder Assurance noch Readiness.

## 19. Conflicts

`EvidenceConflict` soll ein schmaler Vertrag sein: Conflict-ID, beteiligte Observation-/Claim-IDs, Scope, geschlossener Typ (`observation_observation`, `observation_report`, `scope_mismatch`, `identity_ambiguity`), Status und Reason Codes. Beide Seiten bleiben erhalten.

- Zwei Fotos unterschiedlicher Positionen sind zunächst parallele Scopes, nicht automatisch Widerspruch.
- Erst inkompatible Aussagen über dieselbe Entity/Property/Scope bilden einen Conflict.
- Kundenaussage versus Fotoobservation bleibt `reported` versus `observed`; keine Quelle überschreibt still die andere.
- Bei claimfähigen Konflikten werden bestehende Contradiction-Mechanismen verwendet.
- Bessere Evidence darf alte Observation nur explizit superseden; Reviewer-Korrekturen bleiben geschützt.
- Human Review ist nötig, wenn der Konflikt eine safety-/readinessrelevante Claimentscheidung blockiert; andernfalls kann weitere Evidence angefordert oder offen gelassen werden.

## 20. Bad Evidence

Unscharf, dunkel, falscher Bereich, zu nah/weit, verdeckt oder ohne ausreichende Umgebung führt zu `insufficient`, `wrong_target`, `obstructed`, `ambiguous` oder `invalid`. Das Interpretationsergebnis darf `evidence_insufficient` beziehungsweise eine entsprechende geplante geschlossene Fehler-/Reason-Semantik sein.

Es entsteht keine technische Annahme. Später kann `request_better_evidence` als eigener kontrollierter Collectionpfad auditiert werden. Retry darf nur bei realistischer Behebbarkeit (z. B. falscher Ausschnitt/Dunkelheit) und innerhalb eines Effort-/Attempt-Limits erfolgen; unsupported scene oder safety-kritische Unklarheit führt eher Review/Site Check als wiederholte Fotoanforderungen.

## 21. Vision Actor

Die bestehende Actor-Klasse `ai` ist für spätere Observations geeignet. AI ist aber **kein Reviewer**. Zulässig ist automatische Observation nur, wenn Target, Observation Type, Quality, Scope und Actor in einer statischen Regel erlaubt sind. Ein AI-Befund darf niemals `manually_confirmed`, `manually_corrected` oder `confirmed` behaupten.

AI darf künftig einen Claim Proposal nur anstoßen, wenn die Property als nicht safety-kritisch und `AUTO_PROPOSABLE` klassifiziert ist, die Sufficiency Rule vollständig erfüllt ist, keine Ambiguität/Conflict vorliegt und der epistemische Status höchstens `observed`/gegebenenfalls `estimated` ist. Empfehlung für das erste MVP: AI darf keine technischen Proposals automatisch anwenden; zunächst synthetischer Adminpfad, danach Mapping separat. Reviewer-/Site-Check-geschützte Properties sind hart ausgeschlossen.

## 22. Expert Review

Geplanter Laurie-Workflow, ohne UI-Implementierung:

1. Laurie erhält serverseitig autorisierten Zugriff auf Asset plus schmale AI-Observation; Domaincontracts enthalten keine URL.
2. Aktionen: **Bestätigen**, **Korrigieren**, **Nicht ausreichend**, **Site Check**.
3. Bestätigen erzeugt ein neues Reviewer Finding, das auf die AI-Observation referenziert; es editiert diese nicht.
4. Korrigieren erzeugt eine neue Reviewer-Observation/Hypothese mit `supersedes_observation_id` und geschlossenem Correction Reason.
5. Nicht ausreichend invalidiert nicht das Asset global, sondern klassifiziert Sufficiency für den Scope.
6. Site Check erzeugt keine technische Freigabe, sondern einen kontrollierten Prüfbedarf.
7. Erst die statische Mapping Registry darf daraus bestehende Proposals erzeugen; die State Transition bleibt separat.

`reviewer` ist die bevorzugte bestehende Actor-Klasse. `admin` darf nur bei explizitem Rollen-/Berechtigungsmapper wie Reviewer handeln; der Begriff „expert“ soll keine sechste Actor-Klasse ohne eigenes Berechtigungsaudit erzwingen.

## 23. Review Classes

Empfohlene, fachlich präzisierte Klassen:

| Klasse | Bedeutung | Beispiele |
|---|---|---|
| `OBSERVATION_AUTOMATIC_ALLOWED` | Nur unmittelbarer sichtbarer Befund darf automatisch erfasst werden. | Fenster/Tür/Wand-/Außenbereich sichtbar, Qualitätsbefund. |
| `CLAIM_PROPOSAL_AUTOMATIC_ALLOWED` | Registry darf aus suffizienten Observations einen nicht geschützten Proposal erzeugen. | Im ersten Paket möglichst leer; später eng definierter sichtbarer Kontextclaim. |
| `EXPERT_REVIEW_REQUIRED` | Technische Folgerung braucht autorisierten Reviewer. | mögliche Montagefläche, Konflikt, ungewöhnlicher Kontext. |
| `SITE_CHECK_REQUIRED` | Bild kann die Property niemals abschließend entscheiden. | verdeckte Leitungen, Bohrsicherheit, Statik, elektrische Eignung, finale Freigabe. |

Die Namen vermeiden „AUTO_OBSERVABLE“ als scheinbare Eigenschaft der Welt und machen die erlaubte Aktion deutlich. Eine Mapping-Regel hat genau eine höchste erforderliche Klasse; Site Check kann durch vorheriges Review nicht herabgestuft werden.

## 24. Claim Mapping

Statische Registry-Schlüssel:

`contract_version + observation_type + target_key + entity_type + property_key` → erlaubter Value-Mapper, epistemischer Status, minimale Quality, erforderliche Observation-Kombination, erlaubte Actor-Klassen, Review Class, Conflict Policy und Reason Codes.

Verbote:

- keine Vision→Property-Freitextzuordnung;
- keine dynamische/Runtime Registry, Datenbankregel oder Promptregel;
- kein unbekannter Property Key und kein frei erzeugter Value;
- keine positive Eignung aus bloßer Sichtbarkeit;
- kein Claim bei `partially_sufficient`, sofern die konkrete Regel dies nicht ausdrücklich für einen Teilclaim erlaubt;
- keine zweite Claim Engine.

Wenn claimfähig, werden bestehendes `EvidenceProposal`, `KnowledgeClaimProposal` und `StateTransitionProposal` erweitert beziehungsweise wiederverwendet. Als Evidence Source ist für reales Foto der bestehende Typ `project_media` naheliegend; `ai_analysis` kann die abgeleitete Observation bezeichnen. Welche einzelne oder kombinierte Referenz der Claim tragen muss, ist in AP-15-04-01-11 verbindlich zu entscheiden. Actor bleibt Ursprung (`ai`, `reviewer`, `admin`), nicht der technische Mapper `system` als Verschleierung des Ursprungs.

## 25. State Transition Boundary

Interpretation darf lediglich Observation/Hypothese und optional einen Proposal-Entwurf liefern. Nur die vorhandene State-Transition-Anwendung darf Knowledge Claims hinzufügen, superseden oder als Widerspruch parallel erhalten. Sie validiert Projekt/Conversation, State-Version, Claim-/Evidence-IDs, Reviewer-Schutz, Supersession und Idempotenz.

Neue Evidence-Pfade müssen diese Invarianten erfüllen. Insbesondere darf weder Vision Adapter noch Reviewer-Frontend `KnowledgeState` entgegennehmen und zurückschreiben. Duplicate Interpretation Replay muss zu demselben Observationsergebnis beziehungsweise `no_change` führen, nicht zu neuen Claim-IDs.

## 26. Readiness

- Evidence Availability allein: **keine Readinesswirkung**.
- Observation allein: **keine Readinesswirkung**.
- Hypothese ohne angewendeten Claim: **keine Readinesswirkung**.
- Claim Proposal ohne State Transition: **keine Readinesswirkung**.
- Reviewer-approved und angewendeter Technical Claim: normale bestehende Readinesslogik, ohne Sonderbonus.
- `requires_site_check`: keine vorgezogene technische Freigabe; bestehende Unsicherheits-/Site-Check-Semantik bleibt sichtbar.

Es gibt keine Readinesssteigerung aufgrund Fotoanzahl, Actor `ai`, Quality allein oder Interpretationstatus `analysed`.

## 27. Human Review

Human Review ist kein Default für jedes Bild. Es wird ausgelöst durch safety-kritische/reviewer-protected Property, fachlich relevanten Conflict, ambige Hypothese, unsupported scene, ungewöhnliche Installation oder geringe Quality bei kritischem Need. Nichtkritische schlechte Evidence soll bevorzugt einen begrenzten Better-Evidence-Pfad oder `leave_open` nutzen.

Review darf fehlende Site-Check-Evidence nicht durch bloßes Klicken ersetzen. Reviewerentscheidungen brauchen Actor-/Projekt-/Scope-Bindung, immutable Finding-ID, Timestamp, geschlossenen Reason und die normale Proposal-/Transition-Kette.

## 28. Site Check

Bildinformation darf niemals allein ersetzen:

- Ortung/Ausschluss verdeckter Leitungen und anderer verdeckter Bauteile;
- Kernbohrungssicherheit und finale Bohrposition;
- Statik/Tragfähigkeit von Wand, Dach, Konsole oder Untergrund;
- elektrische Eignung, Absicherung, Leiterdimensionierung und Normkonformität;
- rechtsverbindliche Schall-, Abstands- oder Nachbarschaftsbewertung;
- vollständige Kondensat-/Entwässerungslösung, soweit verdeckt oder gefälleabhängig;
- sichere Arbeits-/Zugangsmethode;
- endgültige Montagefreigabe.

Fotos können den Site Check vorbereiten, Scope präzisieren und offensichtliche Hindernisse zeigen, ihn aber für diese Properties nicht aufheben.

## 29. Vision Errors

Geplante geschlossene Fehler-Allowlist:

| Code | Bedeutung / Folge |
|---|---|
| `vision_unavailable` | Technischer Adapter nicht verfügbar; retryable nur nach Infrastrukturpolicy, kein Review allein deshalb. |
| `evidence_unusable` | Inhalt nicht nutzbar; Better Evidence, kein Claim. |
| `unsupported_evidence_target` | Target nicht adapter-/registryfähig; nicht frei umdeuten. |
| `observation_not_supported` | Befundtyp nicht erlaubt; verwerfen/telemetrieren ohne Providerdaten. |
| `ambiguous_observation` | Keine eindeutige Observation; weitere Evidence oder kontrolliertes Review. |
| `safety_review_required` | Mapping trifft geschützte Klasse; Reviewer/Site Check. |
| `interpretation_failed` | Geschlossener interner Fehler; kein Raw-Output, Promptdetail oder Partial Claim. |

Providerrohdaten, Promptdetails, Stack-/Tokeninformationen und freie Fehltexte gelangen nicht in Domain oder UI. Replay-/Retryability wird pro Code kontrolliert festgelegt.

## 30. Privacy

Interpretation Contracts enthalten keine Namen, E-Mail, Telefon, Adresse, GPS, EXIF, Gesichtserkennung, Personenidentität, Kundentexte, Storage-/Signed URLs, Tokens oder Providerantworten. Zufällig sichtbare Personen werden weder erkannt noch klassifiziert; der Adapter soll soweit technisch möglich personenbezogene Bereiche minimieren/redigieren, bevor abgeleitete Domainoutputs entstehen.

Keine Biometrie, Identifikation, Demografie- oder Verhaltensklassifikation. Observations dürfen nicht „Person sichtbar“ als fachlichen Klimaanlagenbefund aufnehmen. Logs enthalten ausschließlich opaque IDs, geschlossene Status-/Reason Codes und technische Laufmetadaten ohne Bildinhalt oder PII.

## 31. Project Media Boundary

Spätere minimale Bindung:

`Evidence Request ID ↔ Project Media ID ↔ Evidence ID`.

Alle IDs sind opaque, projektgebunden und serverseitig autorisiert. Storage Path, Bucket, URL, Signed URL, MIME-Providerdetails und Bytes bleiben außerhalb der Conversation-Intelligence-Domain. Die Engine bekommt weder Clientzugriff noch Storage-Credentials. Bindungs-, Lebenszyklus-, Lösch- und Berechtigungsregeln benötigen ein separates Real Project Media Binding Audit.

## 32. Vision Adapter Boundary

Späterer serverseitiger Adapterinput: opaque Evidence Identity, kontrolliertes Target/Purpose, erlaubte Observation-Version sowie Bildbytes oder kurzlebiger Zugriff ausschließlich in der Adapter-/Infrastructure-Schicht. Output: narrow Observation DTO plus geschlossener Fehler.

Ausdrücklich kein Output: `KnowledgeState`, Planner Action, Readiness, Offer, Preis, Freigabe, freie technische Zusammenfassung als Wahrheit, Chain-of-Thought oder Providerpayload. Die Domain muss ohne Vision-Paket importierbar und vollständig synthetisch testbar bleiben.

## 33. Synthetic Interpretation

Nächstes sichere Implementierungspaket ist ein Vision-freier Admin-/Fixturepfad:

`available_unanalysed` → kontrollierte Auswahl „Bereich gut sichtbar“ / „Mögliche Position sichtbar“ / „Foto nicht ausreichend“ → immutable Observation → optional erst in späterem Paket Claim Proposal.

AP-15-04-01-10 implementiert ausschließlich Contract, Schemas, Registry-Grundlagen und synthetische Observation-Erzeugung. Keine Vision, kein reales Bild, keine Media-Bindung und noch keine Knowledge-Mutation. So werden Target-/Actor-/Quality-/Idempotenzgrenzen vor jedem Provider getestet.

## 34. Reference Cases

Legende Readiness: `keine` bedeutet ohne angewendeten Claim; auch ein zulässiger Proposal allein wirkt nicht.

| Fall | Target | Observation | Quality | Claim zulässig? / Epistemik | Review? | Site Check? | Readiness | Nächstes Collection-Verhalten |
|---|---|---|---|---|---|---|---|---|
| A Room overview sufficient | `room_overview` | `room_overview_visible`, Fenster/Tür | sufficient | kein Dimensionsclaim; `observed` | nein | für Maße/Planung ggf. ja | keine | Need offen oder gezielte Maße erheben |
| B Room overview insufficient | `room_overview` | `image_insufficient` | insufficient | nein; kein technischer Status | nein | nein | keine | begrenzt besseres Foto anfragen |
| C Indoor wall visible | `indoor_area_overview` | `wall_area_visible` | sufficient | Sichtbarkeitsclaim nur bei späterer Property; `observed` | nein | Bohrung/Statik ja | keine | Positionskontext weiter erheben |
| D Indoor area obstructed | `indoor_area_overview` | `image_obstructed` | obstructed | nein | nein | nein | keine | besseres Foto oder offen lassen |
| E Possible indoor location | `indoor_area_overview` | `possible_indoor_mounting_area_visible` | sufficient | technische Position nicht automatisch; Hypothese/`estimated` | ja vor technischem Claim | Statik/Bohrung ja | keine | Reviewer oder weitere Perspektive |
| F Outdoor area visible | `outdoor_area_overview` | `outdoor_area_visible` | sufficient | nur sichtbarer Kontext; `observed` | nein | finale Position ja | keine | offene Positionsprüfung fortsetzen |
| G Outdoor ambiguous | `outdoor_area_overview` | mögliche Fläche | ambiguous | nein; Hypothese höchstens | bei relevantem Need ja | finale Position ja | keine | weitere Perspektive/Review |
| H Line-route partial | `line_route_context` | `line_route_context_visible` | partially_sufficient | kein Machbarkeitsclaim; `observed` | nein | verdeckte Teile ja | keine | fehlende Ansicht erheben |
| I Line-route observation sufficient | `line_route_context` | Kontext klar sichtbar | sufficient_for_observation | nur Observation, keine Feasibility; `observed` | nein | Bohrung/verdeckte Leitungen ja | keine | Need technisch offen halten |
| J Electrical socket visible | `electrical_area` | `electrical_connection_visible` | sufficient | **kein technischer Elektroclaim**; `observed` | nicht für Sichtbarkeit | Eignung ja | keine | Elektroprüfung vormerken |
| K Electrical suitability forbidden | `electrical_area` | Anschluss sichtbar | sufficient | `electrical_supply_suitable` verboten; unbekannt/requires site check | ja falls fachlich weiterbearbeitet | ja | keine | Site Check/Fachprüfung |
| L Accessibility ground context | `accessibility_context` | Bodenhöhenkontext sichtbar | sufficient | höchstens enger Kontextclaim; `observed` | nein | sichere Arbeitsmethode ja | keine | Hindernisse/Position weiter prüfen |
| M Accessibility ambiguous | `accessibility_context` | Höhen-/Zugangsbezug unklar | ambiguous | nein | bei kritischer Planung ja | ggf. ja | keine | bessere Ansicht oder Review |
| N Complementary photos | kompatibles Target/Set | Wand plus Umgebung aus zwei Bildern | je sufficient/partial | nur wenn konkrete Set-Sufficiency erfüllt; `observed` | propertyabhängig | unverändert | keine ohne Claim | fehlende Pflichtansicht prüfen |
| O Conflicting photos | gleiches Need, unklarer Scope | unterschiedliche Positionen | ambiguous | keine stille Auswahl; `contradicted` erst auf Claimstufe | ja bei gleicher Scope-Behauptung | ggf. | keine | Scope klären/Reviewer |
| P Customer vs photo | `outdoor_area_overview` | Foto passt nicht zu „links“ | sufficient/ambiguous | reported und observed parallel; kein Auto-Supersede | bei relevanter Claimkollision ja | finale Position ja | keine | Kundenklärung oder Review |
| Q AI vs reviewer correction | beliebig | AI-Observation durch neue Reviewer-Observation korrigiert | reviewer bewertet | Reviewerfinding, Ursprung erhalten; typischerweise `observed`/ggf. `confirmed` nur Mapping | erfolgt | propertyabhängig | erst nach Transition | korrigierte Observation mappen |
| R Reviewer-approved observation | `indoor_area_overview` | sichtbare mögliche Fläche bestätigt | sufficient | Proposal nur Registry-gemäß; nicht automatisch Montagefreigabe | ja, erfolgt | Statik/Bohrung ja | erst angewendeter Claim | verbleibende Site-Checks sammeln |
| S Site-check-only property | `line_route_context` | Wand sichtbar | sufficient | Bohrsicherheit verboten; `requires_site_check` | Review kann Pfad setzen | ja zwingend | keine Freigabe | Site Check planen |
| T Safety-critical observation | `outdoor_area_overview` | offensichtliche Barriere | sufficient | negativer enger Proposal ggf. reviewerpflichtig; `observed` | ja vor technischer Folge | ggf. ja | erst nach Claim, keine Freigabe | sicheren Prüfpfad wählen |
| U Invalid/unusable | beliebig | keine Observation | invalid | nein | nur bei wiederholtem/kritischem Fall | nein | keine | nicht retrybar bei Invalidität; sonst neues Asset |
| V Duplicate replay | beliebig | identische Observation-ID/Idempotency | unverändert | kein neuer Proposal/Claim | nein | unverändert | keine zusätzliche | idempotent `no_change` |
| W Better photo supersedes | gleiches Target/Scope | klarere neue Observation | sufficient | explizite Supersession; Status nach Inhalt `observed` | nur propertyabhängig | unverändert | erst neuer angewendeter Claim | altes Finding historisch behalten |
| X Vision unavailable | beliebig | keine Observation | keine | nein | nein, bloße Verfügbarkeit ist kein Reviewgrund | nein | keine | kontrollierter Retry oder synthetisch/manuell |

## 35. Owner Decisions

`recommended` ist technische Empfehlung, keine automatisch finalisierte Produktentscheidung. `owner_required` muss vor dem betroffenen Implementierungspaket bestätigt werden.

| # | Entscheidung | Status | Technische Empfehlung |
|---:|---|---|---|
| 1 | Observation-first? | `owner_required` | Ja, Variante E; niemals Vision/Mensch direkt zum Knowledge State. |
| 2 | MVP Observation Types? | `owner_required` | Die Allowlist aus Abschnitt 8; Penetration/Condensate defer. |
| 3 | Welche claimfähig? | `owner_required` | Im AP-10 keine; AP-11 nur explizite, nicht-eignungsbezogene Mappings. |
| 4 | Welche brauchen Reviewer? | `owner_required` | Montageflächenhypothesen, relevante Konflikte, ungewöhnliche/safety-nahe Folgen. |
| 5 | Site-check-only? | `owner_required` | Verdeckte Leitungen, Bohrung, Statik, Elektro-Eignung, rechtlicher Schall, finale Freigabe. |
| 6 | AI darf Claims vorschlagen? | `owner_required` | Später nur `CLAIM_PROPOSAL_AUTOMATIC_ALLOWED`; erster MVP nein. |
| 7 | AI darf automatisch anwenden? | `owner_required` | Nein, mindestens bis AP-11 und Production Gates abgenommen sind; geschützte Claims dauerhaft nein. |
| 8 | Welche Quality reicht? | `owner_required` | `sufficient_for_observation`; Property-Claim nur über zusätzliche konkrete Sufficiency Rule. |
| 9 | Mehrere Fotos aggregieren? | `recommended` | Observation Set mit kompatiblen Scopes; keine Count-basierte Completeness. |
| 10 | Konflikte? | `recommended` | Parallel erhalten, typisieren, bestehende Contradiction nutzen, keine stille Priorisierung. |
| 11 | Bessere Evidence superseded alte? | `recommended` | Neue immutable Observation mit expliziter Supersession und Reason. |
| 12 | Eigene Versionierung? | `recommended` | Contract-Version plus immutable Revision/Supersession, kein In-place-Update. |
| 13 | Observation Sets? | `owner_required` | Ja, aber erst AP-11 falls eine Mapping Rule mehrere Assets benötigt. |
| 14 | Reviewer Correction? | `recommended` | Neues Finding referenziert und superseded; alte AI-Observation bleibt auditierbar. |
| 15 | PII/EXIF entfernen? | `owner_required` | Sämtliche in Abschnitt 30 genannten Felder; keine Gesicht-/Identitätsanalyse. |
| 16 | Elektroclaims verbieten? | `owner_required` | Alle automatischen Eignungs-/Norm-/Absicherungsclaims im MVP vollständig verbieten. |
| 17 | Core-Drilling-Claims verbieten? | `owner_required` | Sicherheit, Leitungsfreiheit und Freigabe vollständig Site-check-only. |
| 18 | Accessibility Claims? | `owner_required` | Nur offensichtliches Hindernis/enger sichtbarer Kontext; keine sichere Arbeitsmethode. |
| 19 | Visionfehler Retry vs Review? | `recommended` | `vision_unavailable` begrenzt retry; unusable/wrong view Better Evidence; Ambiguität/safety Review; Invalidität stop. |
| 20 | Kleinstes sichere Paket? | `owner_required` | AP-15-04-01-10: synthetische immutable Observation Domain ohne Claim Mapping/State Mutation. |

## 36. Recommended Packages

1. **AP-15-04-01-10 — Synthetic Evidence Interpretation and Observation Domain:** Contracts, Allowlist, Quality, Scope, Actor-Bindung, immutable/idempotente synthetische Findings; keine Claims, Vision oder Media.
2. **AP-15-04-01-11 — Observation to Claim Proposal Mapping:** statische Mapping-/Sufficiency-/Review Registry, Observation Sets soweit erforderlich, bestehende Proposaltypen und harte Forbidden-Inference-Tests; zunächst keine automatische AI-Anwendung.
3. **AP-15-04-01-12 — Evidence Interpretation Simulator Integration:** ausschließlich synthetische Adminauswahl, Inspector/Conversation-Orchestration und End-to-End-Replay; weiterhin keine Vision/realen Medien.
4. **Real Project Media Binding Audit:** IDs, Authorization, Lifecycle, Datenschutz, Löschung und serverseitige Storage-Grenze.
5. **Vision Adapter Audit:** Adaptercontract, Provider-/Error-/Privacy-/Redaction-/Operationsgrenzen; keine Implementierung.
6. **Vision Implementation:** erst nach Ownerentscheidungen, Gates, synthetischer Pipeline und separater Sicherheitsfreigabe.

Der Schnitt kann nach AP-10/11-Befund weiter verkleinert werden. Insbesondere darf Simulatorintegration nicht Observation Contract und Mapping gleichzeitig erfinden.

## 37. Test Strategy

Spätere, noch nicht implementierte Tests:

- strikt geschlossene Schemas, Observation Types, Values, Quality, Reason Codes und Contract-Version;
- Target-/Purpose-/Entity-/Project-/Conversation-Bindung sowie Actor-Matrix;
- PII-/EXIF-/URL-/Bytes-/Freitext-Ausschluss und Strict-Object-Rejection;
- Immutability, Supersession, Reviewer Correction und geschützte Reviewer Findings;
- Multiple Evidence/Observation Sets ohne Count-Completeness;
- Conflicts, parallele Evidence, bestehende Contradiction und keine stille Überschreibung;
- Replay/Idempotency und identische Observation ohne doppelte Claims;
- statische Claim-Mapping-Registry, unknown mappings fail closed, keine Runtime-/DB-Regeln;
- forbidden technical inference: sichtbare Wand/Route/Außenfläche ≠ technische Eignung;
- elektrische Safety: keine Eignungs-/Absicherungs-/Normclaims;
- Kernbohrung: keine Safety-/Leitungsfreiheitsclaims;
- Site-Check-only bleibt auch nach Reviewer-/AI-Observation erhalten;
- Readiness unverändert bei Availability, Observation, Hypothese und unapplied Proposal;
- synthetische Simulatorinterpretation vor Vision;
- Architekturgrenzen: Domain importiert keinen Vision-/Provider-/Storage-Code, kein Knowledge-State-Write aus Adapter;
- Fehlerklassifikation/Retry vs Review ohne Providerrohdaten.

Keine dieser Tests oder Testdateien wird in diesem Audit geändert.

## 38. Production Gates

Vor Produktion müssen mindestens erfüllt sein:

1. Ownerentscheidungen 1–8, 13, 15–18 und 20 dokumentiert/freigegeben.
2. AP-10 bis AP-12 getrennt implementiert, reviewed und vollständig getestet.
3. Negative Safety-Tests für Elektro, Kernbohrung, Statik, Schall und Montagefreigabe sind zwingend grün.
4. Readiness-Regression beweist null Wirkung bis zum angewendeten gültigen Claim.
5. Reviewer-/Admin-Berechtigungsmapper und auditierbare Correction-/Supersession-Regeln sind freigegeben.
6. Project-Media- und Vision-Adapter-Audits einschließlich Datenschutz, Löschung, Zugriff und Incident-Verhalten sind abgeschlossen.
7. Keine PII/EXIF/URLs/Providerpayloads in Domain, Logs oder Fehlern.
8. Idempotenz, Conflict und Multiple-Evidence-Verhalten sind deterministisch.
9. Site-Check-only-Registry ist fachlich durch Klima-/Elektroexperten bestätigt.
10. Kein automatischer Angebots-, Preis- oder Freigabepfad aus Evidence.

Bis dahin ist `available_unanalysed` der korrekte sichere Endpunkt.

## 39. Scope Confirmation

Ausdrückliche Bestätigung für dieses Paket:

- ausschließlich Audit;
- keine Implementierung;
- keine Evidence Observation;
- keine Claim-Erzeugung;
- keine Knowledge-State-Mutation;
- keine Vision;
- keine KI;
- kein Upload und keine Dateiänderung außerhalb dieser Auditdatei;
- keine Project-Media-Bindung;
- keine DB, Migration, SQL, RPC, RLS oder Supabase-Änderung;
- keine UI oder Simulatoränderung;
- keine Tests oder Teständerungen;
- kein WhatsApp;
- keine Knowledge Base;
- keine Metrics;
- keine `package.json`-Änderung.

## 40. Status

**Auditstatus: READY FOR OWNER DECISION**

**EVIDENCE REQUEST PLANNING — IMPLEMENTED**

**EVIDENCE REQUEST ORCHESTRATION — IMPLEMENTED**

**AVAILABLE UNANALYSED EVIDENCE — IMPLEMENTED**

**EVIDENCE OBSERVATION DOMAIN — NOT IMPLEMENTED**

**EVIDENCE INTERPRETATION — NOT IMPLEMENTED**

**OBSERVATION TO CLAIM MAPPING — NOT IMPLEMENTED**

**REAL PROJECT MEDIA BINDING — NOT IMPLEMENTED**

**VISION ANALYSIS — NOT IMPLEMENTED**

**EXPERT EVIDENCE REVIEW — NOT IMPLEMENTED**

**WHATSAPP MEDIA COLLECTION — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**
