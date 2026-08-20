# AP-15-04-01-12 — Descriptive Technical Knowledge Model Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-20-AP15-04-01-12-DESCRIPTIVE-TECHNICAL-KNOWLEDGE-MODEL-V1` |
| Datum | 2026-08-20 |
| Audit-Branch | `codex/audit-ap15-04-01-12-descriptive-knowledge-model` |
| Ausgangs-/Baseline-Branch | `work` |
| Baseline-HEAD | `bb63050b57e2823afae168f9a536e325092e83c0` |
| Baseline-Commit | `Merge pull request #110 from laulix-krander/codex/add-observation-to-claim-proposal-mapping` |
| Baseline | Sauberer Worktree; anschließend ausschließlich der Audit-Branch angelegt. |
| Remote Status | Kein Git-Remote konfiguriert; Fetch, Ahead/Behind-Abgleich und Remote-Baseline sind nicht möglich. |
| Verbindliche Grundlage | AP-15-04-01-09 vollständig einschließlich AP-15-04-01-10/-11, AP-15-04-01-03 vollständig einschließlich Result-Abschnitten, aktuelle Conversation-Intelligence-Domain und bestehende Project-Media-/Upload-/Gallery-Grenzen. |
| Auditstatus | **READY FOR OWNER DECISION** |
| Produktionsstatus | **NOT PRODUCTION READY** |

## 2. Scope

Dieses Paket ist ausschließlich Audit, Analyse, Domain-, Safety-, Wissensmodell-, Lifecycle-/Evidence-Boundary-, Test- und Dokumentationsplanung. Es legt keine fachliche Entscheidung stillschweigend fest und implementiert nichts.

Untersucht werden die Grenze zwischen Evidence Observation und langlebigem Projektwissen, eine geschlossene Strength-Ladder, potenzielle wenige descriptive Properties, Actor-/Review-/Site-Check-Grenzen, Readiness und Planner sowie der spätere Lebenszyklus echter Kundenfotos. Project Media, Gallery und Upload werden nur zur Architekturabgrenzung gelesen.

## 3. Current Knowledge / Observation Boundary

Der implementierte Pfad ist heute:

`Technical Need → Information Gain → Evidence Request → synthetische Evidence Availability → EvidenceObservation → Observation-to-Claim Mapping → STOP`.

`EvidenceObservation` ist strikt, immutable gedacht, targetgebunden und kennt nur opaque UUIDs. Die aktuelle Allowlist enthält sichtbare Merkmale und negative Bildqualitätsbefunde. Die Mapping Registry ist build-time, statisch, actor- und quality-begrenzt. Sie liefert kontrollierte Resultate, wendet aber nichts an. Die `auto_proposable`-Teilmenge ist mangels verlustfreier Property **leer**.

Der bestehende `KnowledgeState` kennt ausschließlich Projekt-, Raum- und Installationsproperties. Claims tragen Evidence References und Epistemik; effektive Claims, Contradictions und Supersession sind bereits vorhanden. Readiness und Missing Information werden ausschließlich aus diesen Technical Claims abgeleitet. Weder Observation noch Evidence Availability dürfen diese Mechanik indirekt umgehen.

Ist-Grenzen:

- `possible_outdoor_mounting_area_visible` ist nicht `outdoor_unit_position_known = true`.
- `electrical_connection_visible` ist nicht `electrical_supply_known = true` und niemals `electrical_supply_suitable = true`.
- `line_route_context_visible` ist nicht `line_route_known = true`.
- `wall_penetration_context_visible` ist keine Bohrfreigabe.
- `accessibility_context_visible` ist keine sichere Zugangsmethode.
- Mehr Bilder sind weder automatisch höhere Strength noch technische Sufficiency.

## 4. Core Problem

Eine Observation beschreibt unmittelbar, was in einem konkreten Evidence Asset unter einem konkreten Scope gesehen wurde. Ein Technical Property behauptet dagegen langlebiges, projektfachlich nutzbares Wissen. Wird ein sichtbares Merkmal auf einen semantisch stärkeren Boolean abgebildet, gehen Scope, Unsicherheit und die Differenz zwischen „erfasst“ und „geeignet“ verloren.

Der zentrale Persistenztest lautet:

> Bleibt die Aussage fachlich sinnvoll und wahr, wenn das ursprüngliche Foto später nicht mehr direkt angezeigt wird?

Ein „Nein“ bedeutet Observation-only. Ein „Ja“ eröffnet nur eine Kandidatur; zusätzlich müssen Projektrelevanz, Stabilität, Verlustfreiheit, Evidence-Treue, Korrigier-/Supersedierbarkeit, tatsächlicher Workflow-Nutzen und geringe State-Aufblähung erfüllt sein. Sichtbarkeit durch ein Vision-System allein ist niemals ein Property-Grund.

## 5. Architecture Variants

Bewertung: 1 = schwach/risikoreich, 5 = stark; bei MVP-Komplexität bedeutet 5 = einfach.

| Kriterium | A Observation-only | B Descriptive Layer | C bestehender State erweitert | D separater Evidence Fact State | E Hybrid |
|---|---:|---:|---:|---:|---:|
| Fachliche Wahrheit | 4 | 5 | 3 | 5 | 5 |
| Sicherheit | 5 | 4 | 2 | 4 | 5 |
| Wartbarkeit | 4 | 4 | 3 | 3 | 5 |
| Readiness-Trennung | 5 | 4 | 2 | 5 | 5 |
| Planner-Nutzen | 2 | 4 | 4 | 4 | 5 |
| Evidence Review | 3 | 5 | 3 | 5 | 5 |
| Vision-Unabhängigkeit | 5 | 4 | 3 | 4 | 5 |
| Laurie-Workflow | 2 | 5 | 4 | 5 | 5 |
| Historische Chats | 3 | 4 | 3 | 4 | 5 |
| Knowledge-Base-Anschluss | 2 | 5 | 3 | 5 | 5 |
| Niedrige Fehlerrate | 5 | 4 | 2 | 4 | 5 |
| Supersession/Widerspruch | 3 | 5 | 4 | 5 | 5 |
| Storage-/Retention-Unabhängigkeit | 2 | 5 | 4 | 5 | 5 |
| MVP-Komplexität | 5 | 3 | 4 | 2 | 3 |

- **A – Observation-only:** maximal konservativ und für das heutige MVP gültig. Es verliert jedoch eine langlebige Zusammenfassung, erschwert Planner/Review nach Medien-Tombstone und macht die spätere Knowledge Base evidence-lastig.
- **B – eigener Descriptive Knowledge Layer:** klare Semantik, aber Gefahr einer zweiten Claim-/Contradiction-Engine. Nur sinnvoll, wenn er die bestehende Claim-Infrastruktur nutzt und keine parallele Wahrheit erzeugt.
- **C – bestehender Knowledge State direkt erweitern:** wenig neue Struktur, aber deskriptive und technische Properties werden leicht gleichbehandelt; heutige Readiness-Logik könnte deskriptive Claims versehentlich als technische Erfüllung ansehen.
- **D – separater Evidence Fact State:** saubere Schicht zwischen Observation und Technical Knowledge, aber zusätzlicher State, Lifecycle, Persistenz- und Synchronisationsaufwand; für das MVP überdimensioniert.
- **E – Hybrid:** rohe Merkmale bleiben Observations; nur wenige stabile Zwischenfakten dürfen über eine eigene Property-Klasse als Claims in der vorhandenen autoritativen Claim-/Supersession-Architektur leben; Hypothese, Assessment und Freigabe bleiben getrennt.

## 6. Recommended Architecture

**Empfehlung: E, Hybrid, nach Ownerfreigabe.** Bis Contracts implementiert und freigegeben sind, bleibt A das sichere Laufzeitverhalten.

Geplanter Pfad:

`Raw Evidence → opaque Evidence Identity → EvidenceObservation → optional Descriptive Claim Proposal → Human Review/controlled apply policy → bestehender Knowledge Claim/Contradiction/Supersession path`.

Stärkere Pfade bleiben ausdrücklich separat:

`Observation(s) → Technical Hypothesis → qualified Human Assessment → optional Reviewer Approval → erforderlicher Site Check → site-verified finding`.

Architekturregeln:

1. Eine kleine statische `descriptive`-Property-Klasse, aber keine zweite Claim Engine und kein separater Evidence Fact State im MVP.
2. Bestehende Claim-IDs, Evidence References, Contradictions und Supersession wiederverwenden.
3. Descriptive Properties dürfen nicht in bestehende Technical-Readiness-Requirements einsickern.
4. Proposal und Anwendung bleiben getrennt; für das erste Paket keine automatische Anwendung.
5. Hypothese/Assessment sind eigene Strength-Semantik, keine umbenannten Observations.
6. Project Media bleibt ein externer Aggregate-/Adapterbereich; Conversation Intelligence sieht nur opaque Bindungen.
7. Property- und Strength-Registries sind statisch, versioniert, tief immutable und klein.

## 7. Safety Ladder

Empfohlene geschlossene Ladder; „höher“ bedeutet stärkere fachliche Aussage, nicht pauschal bessere Bildqualität.

| Stufe | Bedeutung | Actor Sources | Erlaubte Evidence | Claimfähigkeit | Readinesswirkung | Human-Review-Grenze | Site-Check-Grenze |
|---|---|---|---|---|---|---|---|
| `observed` | Unmittelbar sichtbarer, scopegebundener Befund. | `admin`, `reviewer`, später `ai`; `system` nur Metaableitung | einzelnes gebundenes Asset, qualitative Observation | keine Technical-Claimwirkung; Observation-State | keine | nur bei Konflikt/Ambiguität | ersetzt nie Site Check |
| `descriptive_fact` | Stabile, verlustfreie Projektzusammenfassung ohne Eignung. | Proposal: `admin`, `reviewer`, ggf. `ai`; Apply zunächst Mensch | eine oder mehrere kompatible Observations | nur Allowlist-Property, epistemisch `observed` | nur Collection/Evidence, nie Technical Readiness | initial kontrolliertes Review; spätere Auto-Apply-Frage offen | keine Safetyfreigabe |
| `technical_hypothesis` | Widerrufbare Möglichkeit über Sichtbares hinaus. | `reviewer`, `admin`; `ai` höchstens Proposal | Observations plus Kontext, nie bloße Confidence | eigener Hypothesencontract, nicht confirmed | keine Erfüllung; kann Evidenzbedarf auslösen | zwingend vor technischer Nutzung | kann Site Check anfordern, nicht ersetzen |
| `technical_assessment` | Fachliche Beurteilung durch qualifizierten Menschen. | rollen-/qualifikationsgeprüfter Reviewer | Observations, Claims, Unterlagen, fachlicher Kontext | Technical Claim je Property-Contract | nur property-spezifisch | Autor und Grundlage auditierbar | Site-check-only Keys bleiben offen |
| `reviewer_approved` | Explizit geprüfte, nicht zwingend vor Ort bestätigte Aussage. | autorisierter Reviewer | nachvollziehbare Evidence/Assessment | bestätigter Claim, wenn Contract erlaubt | property-spezifisch; kein globaler Freibrief | Reviewer-Schutz/Supersession | kann Vor-Ort-Grenze nicht aufheben |
| `site_verified` | Vor Ort durch qualifizierte Person verifizierter Befund. | qualifizierter Site-Check-Actor/Reviewer | Vor-Ort-Prüfung und dokumentierter Scope | stärkste erlaubte Fact-Stufe | gemäß Technical Property | Korrektur nur kontrolliert | erfüllt nur explizit geprüfte Site-Check-Property |

`reviewer_approved` und `site_verified` sind keine lineare Austauschbarkeit: Manche Aussagen dürfen reviewer-approved genügen, andere sind zwingend site-verified. Das Maximum wird pro Property festgelegt.

## 8. Property Strength Model

Ein expliziter, versionierter **Property-Strength-Contract ist notwendig**. Pro Property muss er mindestens Entity, Value Type, Property Class, maximale Strength, erlaubte Actor-/Evidence-Klassen, Review Requirement, Site-Check-only, Readiness-Dimension und Supersession-Regeln festlegen. Eine Mapping Rule darf niemals eine höhere Strength erzeugen als dieser Contract.

Beispielgrenzen:

| Property/Aussage | Maximale bzw. minimale zulässige Grenze | Begründung |
|---|---|---|
| `window_visible` | höchstens `observed`; kein MVP-Property | foto-/scopegebunden, geringer langlebiger Nutzen |
| `room_overview_available` | höchstens `descriptive_fact` | Erfassung, keine Vollständigkeit/Geometrie |
| `possible_outdoor_mounting_area_visible` | Observation; als Eignung höchstens Hypothesenstart | „possible“ ist keine Position |
| `outdoor_position_technically_suitable` | mindestens qualified assessment; ggf. `site_verified` | Schall, Statik, Recht, Umfeld |
| `electrical_supply_suitable` | `site_verified`/Elektrofachprüfung | Foto zeigt keine Absicherung/Normkonformität |
| `core_drilling_safe` | ausschließlich `site_verified` | verdeckte Leitungen/Statik nicht visuell geklärt |

Auch bestehende Technical Properties benötigen rückwirkend einen maximalen Strength-Contract, bevor Observation-Mapping erweitert wird. Epistemic Status und Strength sind verwandt, aber nicht identisch: `observed` als bestehender Epistemic Status darf nicht eine technische Eigenschaft legitimieren, deren Property Contract Assessment oder Site Check verlangt.

## 9. Observation Type Audit

| Observation Type | Evidence Target | Fachliche Bedeutung | Dauerwissen? | Observation-only? | Descriptive Candidate | Hypothese | Human Review | Site Check | Potenzieller Key | Überinterpretationsrisiko |
|---|---|---|---|---|---|---|---|---|---|---|
| `room_overview_visible` | `room_overview` | Raumkontext im Scope sichtbar | bedingt | ja, bis Contract | ja | nein | für Fact-Apply initial | nein | `room_overview_available` | „vollständig“/Maße angenommen |
| `wall_area_visible` | room/indoor | Wandoberfläche sichtbar | gering | ja | nur aggregiert | ggf. mögliche Fläche | bei Position | bei Statik/Bohrung | `relevant_wall_context_observed` | tragfähig/frei/sicher angenommen |
| `window_visible` | room/indoor | Fenster im Bild | nein | **ja** | nein | nein | nein | nein | keiner | Lage/Abstand/Last abgeleitet |
| `door_visible` | room/indoor | Tür im Bild | nein | **ja** | nein | nein | nein | nein | keiner | Bewegungs-/Montagefreiheit abgeleitet |
| `indoor_area_visible` | `indoor_area_overview` | angefragter Innenbereich sichtbar | ja, scopegebunden | Basis bleibt Observation | ja | nein | initial Apply | nein | `indoor_installation_area_observed` | Position bekannt/geeignet |
| `outdoor_area_visible` | `outdoor_area_overview` | angefragter Außenbereich sichtbar | ja, scopegebunden | Basis bleibt Observation | ja | nein | initial Apply | nein | `outdoor_installation_area_observed` | finale Position/Schall/Statik |
| `possible_indoor_mounting_area_visible` | indoor | optisch möglicher Bereich sichtbar | bedingt | ja | evtl. `...observed` | **ja** bei Eignungsfolge | ja | Befestigung/Bohrung | optional `possible_indoor_mounting_area_observed` | „possible“ wird „suitable“ |
| `possible_outdoor_mounting_area_visible` | outdoor | optisch möglicher Bereich sichtbar | bedingt | ja | evtl. `...observed` | **ja** bei Eignungsfolge | ja | finale Freigabe | optional `possible_outdoor_mounting_area_observed` | Recht/Schall/Statik ignoriert |
| `line_route_context_visible` | `line_route_context` | Teilkontext eines möglichen Wegs sichtbar | ja, falls Scope klar | ja | ja | Route ggf. Hypothese | für Route | Machbarkeit/Verdecktes | `line_route_context_observed` | `line_route_known/feasible` |
| `wall_penetration_context_visible` | line route | Oberfläche/Umfeld einer möglichen Durchführung sichtbar | bedingt | ja | Reservekandidat | Durchführungshypothese | ja | **zwingend** für Sicherheit | `wall_penetration_context_observed` | Bohrsicherheit/Leitungsfreiheit |
| `electrical_connection_visible` | `electrical_area` | äußerlich Anschluss sichtbar | gering | **ja empfohlen** | nein im MVP | Eignung nur als gesperrte Frage | qualified human | regelmäßig zwingend | keiner; evtl. später `electrical_connection_observed` | Eignung, Kreis, Absicherung, Norm |
| `accessibility_context_visible` | accessibility/outdoor | Umfeld zur späteren Zugangsprüfung sichtbar | ja, scopegebunden | ja | Reservekandidat | Zugangsmethode | ja | sichere Arbeitsmethode | `mounting_area_access_context_observed` | Leiter/Gerüst/Fahrsicherheit |
| `measurement_reference_visible` | `room_overview` | Referenzobjekt sichtbar | gering | **ja** | nein; ggf. Collection-Meta | Messbarkeitshypothese | bei Maßableitung | ggf. Aufmaß | keiner; `room_measurement_reference_available` verwerfen | exakte Maße aus Perspektive |
| `image_insufficient` | alle aktiven | Scope unzureichend | nein als Technik | **ja** | nein | nein | bei Wiederholung | nein | keiner | negatives Bild wird Sachverhalt |
| `image_obstructed` | alle aktiven | relevanter Bereich verdeckt | nein als Technik | **ja** | nein | nein | ggf. Review/Neuanfrage | nein | keiner | „nicht vorhanden“ statt „nicht sichtbar“ |
| `image_wrong_area` | alle aktiven | falscher Targetbereich | nein | **ja** | nein | nein | Zuordnung klären | nein | keiner | Cross-Target-Generalisation |

Ergebnis: Acht Typen bleiben klar Observation-only (`window`, `door`, Elektro, Messreferenz und drei Bad-Evidence-Typen; `wall_area` allein). Fünf kleine descriptive Kandidaten werden nur zur Ownerentscheidung vorgeschlagen; Possible-Area- und Penetration-/Access-Kandidaten sind Reserve, nicht MVP-Automatik.

## 10. Descriptive Fact Criteria

Ein Fact ist nur zulässig, wenn **alle** Kriterien erfüllt sind:

1. dieselbe Aussage bleibt nach Nichtanzeige/Tombstone des Mediums verständlich und fachlich wahr;
2. Projekt-, Entity- und Target-Scope sind eindeutig;
3. sie fasst Beobachtung verlustfrei zusammen, ohne „known“, „suitable“, „safe“, „approved“, „feasible“ oder Vollständigkeit zu behaupten;
4. sie besitzt einen konkreten Collection-/Planner-/Review-Nutzen;
5. sie ist kein Vision-Score, Bounding Box, UI-Flag, Dateimetadatum oder Providerdetail;
6. Konflikt, Korrektur, Invalidierung und Supersession sind darstellbar;
7. ihr Strength-Maximum und ihre Readiness-Nichtwirkung sind registriert;
8. sie rechtfertigt den zusätzlichen State gegenüber Observation-only.

Observation bleibt evidencegebunden und unmittelbar sichtbar. Descriptive Fact ist eine projektfachliche Zusammenfassung aus einer oder mehreren Observations. „Außenbereich sichtbar“ ist Observation; „ein möglicher Außengerätebereich wurde visuell erfasst“ kann Fact sein; „Außengeräteposition ist geeignet“ ist Assessment/Site-Check-Thema.

## 11. Room Overview

- `room_overview_available`: starker MVP-Kandidat, sofern „available“ als visuell erfasster angefragter Kontext und nicht als aktuell abrufbares Medium definiert wird. Besserer Name: `room_overview_context_observed`.
- `relevant_wall_context_observed`: nur bei klarer Room-/Request-Scope-Bindung; nicht aus beliebigem `wall_area_visible` und nicht „vollständig“.
- `room_measurement_reference_available`: **verwerfen**. Eine sichtbare Referenz bleibt fotoabhängig und garantiert keine kalibrierbare Messung; Observation-only.
- `window_visible` und `door_visible`: Observation-only. Sie helfen Review im Bild, rechtfertigen aber keinen langlebigen State-Key.

## 12. Indoor Area

`indoor_installation_area_observed` ist ein MVP-Kandidat: Er sagt nur, dass der angefragte Inneninstallationskontext erfasst wurde. `indoor_wall_context_available` ist als separater Key wahrscheinlich redundant und bläht den State auf. `possible_indoor_mounting_area_observed` bleibt Reserve und benötigt Review, weil „possible“ leicht als Eignung verstanden wird.

Ausgeschlossen: `indoor_position_approved`, `indoor_position_suitable`, `mounting_safe`, Tragfähigkeit, Befestigungsart und verdeckte Leitungsfreiheit. Der Planner darf bei einem gültigen descriptive Fact ein weiteres generisches Innenfoto vermeiden, aber `indoor_unit_position_known` bleibt offen.

## 13. Outdoor Area

`outdoor_installation_area_observed` ist ein MVP-Kandidat. `possible_outdoor_mounting_area_observed` und `outdoor_access_context_observed` sind Reservekandidaten, weil Scope und Review-Nutzen zunächst belegt werden müssen.

Nie daraus ableitbar: finale Außenposition, Schall-/Nachbarschafts- oder Baurechtskonformität, Tragfähigkeit, Kondensatableitung, Zugangsfreigabe oder finale Montagefreigabe. Ein Outdoor-Fact bedeutet nur, dass relevanter Kontext erfasst wurde.

## 14. Line Route

`line_route_context_observed` ist ein MVP-Kandidat, sofern der Scope den betrachteten Innen-/Außenbezug identifiziert. `possible_route_context_available` ist sprachlich unklar und wird verworfen. `wall_penetration_context_observed` bleibt Reserve und reviewerpflichtig.

Keiner dieser Facts setzt `line_route_known`, `route_feasible`, `route_approved` oder `core_drilling_safe`. Der sichtbare Ausschnitt kann verdeckte, nicht fotografierte oder baulich unbekannte Abschnitte nicht bestätigen.

## 15. Electrical

**Empfehlung: `electrical_connection_visible` bleibt Observation-only; kein Electrical descriptive Property im MVP.** Der langlebige Nutzen ist gering, während das Fehlverständnis als Versorgungseignung hoch ist. Eine spätere qualifizierte Review kann eine getrennte technische Aussage erzeugen, aber automatische Foto-Evidence darf niemals `electrical_supply_suitable`, Absicherung, Stromkreis, Dimensionierung oder Normkonformität behaupten.

## 16. Accessibility

`mounting_area_access_context_observed` ist ein Reservekandidat für Collection/Review. Er bestätigt nur, dass Umfeld sichtbar war. `accessibility_confirmed`, `safe_ladder_access`, `scaffold_not_required`, sichere Arbeitshöhe und freigegebene Zugangsmethode sind technische/Safety-Aussagen und nicht automatisch aus Bildern ableitbar.

## 17. Core Drilling

`wall_penetration_context_observed` kann später als deskriptiver Review-Hinweis sinnvoll sein, ist aber kein vorrangiger MVP-Key. Er bestätigt nur sichtbaren Oberflächen-/Umfeldkontext. `core_drilling_safe`, Freiheit von Leitungen, Wandaufbau, Statik und zulässige Bohrstelle bleiben **site-check-only**; auch Reviewer Approval ohne Vor-Ort-Prüfung hebt diese Grenze nicht auf.

## 18. Multiple Evidence

Mehrere Observations dürfen nur zusammengefasst werden, wenn sie dasselbe Projekt, dieselbe Entity, denselben fachlichen Target Scope und kompatible Contractversionen betreffen. Ergänzende Perspektiven dürfen Coverage erhöhen; sie erhöhen nicht automatisch Strength.

Erforderliche Gates:

- jede beitragende Observation erfüllt ihre eigene Mindestqualität;
- Perspektiven sind ergänzend und nicht bloß Duplikate;
- keine `image_wrong_area`, relevante Obstruction, Ambiguität oder Konflikte;
- eine Property-Regel benennt das erforderliche Observation Set explizit;
- alle Evidence IDs bleiben am Proposal nachvollziehbar;
- spätere Reviewer Correction kann Fact und Quellen kontrolliert superseden.

Es gibt keine Regel „n Bilder = confirmed“. Ein einzelnes suffizientes Bild kann für einen engen descriptive Fact genügen; zehn Bilder können für technische Eignung weiterhin insuffizient sein.

## 19. Conflicts

Descriptive Facts dürfen Observation Conflicts niemals verdecken. Default:

`relevanter Observation Conflict → kein neuer descriptive Claim → conflicting_observations`.

Bei einem rein deskriptiven, durch zusätzliche klare Evidence auflösbaren Konflikt darf ein Human Review angefordert werden. Bei Safety-, Actor-, Scope- oder Technical-Claim-Konflikten ist Review zwingend; Site-check-only bleibt Site Check. Es gibt keine Actor- oder Quality-Hierarchie, die still überschreibt.

Die vorhandene Claim-Contradiction-/Supersession-Architektur bleibt autoritativ. Eine Correction erzeugt neue Observation/Claim-Identität und explizite Supersession; bestehende Evidenz wird nicht in-place umgeschrieben. Reviewer-/manual-corrected Claims bleiben vor AI-/System-Supersession geschützt.

## 20. Actor Boundary

| Actor | Observations | Descriptive Proposal | Descriptive Apply | Hypothese/Assessment | Grenze |
|---|---|---|---|---|---|
| `customer` | keine visuelle Interpretation; liefert Raw Evidence/Angaben | nein | nein | nur reported Information | kein technischer Reviewer |
| `admin` | synthetisch/operativ erlaubt | erlaubt nach Rule | initial nur kontrolliert | Hypothese möglich, Assessment nur mit Qualifikationsmapping | kein Site-Check-Bypass |
| `reviewer` | erlaubt | erlaubt | kontrolliert erlaubt | fachliche Assessment nach Property Contract | Reviewer ≠ Vor-Ort-Nachweis |
| `ai` | später schmale Allowlist | optional Proposal, Ownerentscheidung | **nicht automatisch im ersten Paket** | Hypothese höchstens Proposal; kein Assessment | nie Approval/Site Verification |
| `system` | nur deterministische Metaableitung, nicht „gesehen“ | Aggregation nur aus erlaubten Inputs | nur später explizite Apply-Policy | keine fachliche Beurteilung | keine erfundene Evidence |

## 21. Readiness Boundary

Vergleich:

- **A keine Wirkung:** maximal sicher, aber erfasste Evidence ist im Collection-Fortschritt nicht nutzbar.
- **B nur Collection-/Evidence-Readiness:** trennt „Foto-/Kontext vorhanden“ von technischer Klärung.
- **C bereitet Technical-Readiness-Dimensionen vor:** sprachlich attraktiv, aber „vorbereiten“ kann leicht als Teil-Erfüllung oder Score missverstanden werden.

**Empfehlung B.** Descriptive Facts dürfen ausschließlich einen künftig getrennten Collection-/Evidence-Status beeinflussen. Sie erfüllen keinen Technical Need, entfernen keinen Missing-Information-Blocker, erhöhen kein bestehendes Readiness Level und ändern keine Technical Readiness Dimension. Solange kein eigener Collection-Readiness-Contract implementiert ist, ist ihre Laufzeitwirkung null.

## 22. Planner Boundary

Später darf der Planner descriptive Facts als Deduplizierungs-/Collection-Signal lesen. Beispiel: `outdoor_installation_area_observed` kann einen weiteren **generischen** Outdoor-Fotowunsch sperren oder eine gezieltere Ergänzung anfordern. Es darf weder `outdoor_unit_position_known` schließen noch Site Check, Assessment oder technische Frage unterdrücken.

Planner-Regeln müssen Property Class und Effekt explizit registrieren: `collection_satisfied_for_target`, `request_more_specific_view`, `human_review_needed` oder keine Wirkung. Keine Stringheuristik aus `*_observed`.

## 23. Information Gain Boundary

Observation oder descriptive Fact kann den Collection Path kontrolliert von `future_photo_request` zu `existing_evidence` ändern. Dies bedeutet ausschließlich: Für diesen Evidence Scope existiert bereits Material/ausgewerteter Kontext. `gain_status`, Technical Need, Missing Information und Readiness bleiben offen, bis eine zulässige technische Claim-Kette sie tatsächlich erfüllt.

Bei insuffizienter, falscher oder konfligierender Evidence bleibt ein gezielter neuer Evidence Path möglich. Derselbe descriptive Fact darf nicht sowohl Deduplizierung als auch technische Sufficiency vortäuschen.

## 24. Knowledge Base Boundary

Eine spätere Knowledge Base muss Einträge typisiert trennen: `observation`, `descriptive_fact`, `technical_hypothesis`, `technical_assessment`, `reviewer_correction` und `site_check_rule/finding`. Laurie darf diese Klassen anzeigen und begründen, aber nicht sprachlich nivellieren.

Knowledge-Base-Regeln dürfen Property-Strength-Verträge erklären oder Review leiten; sie dürfen keine Runtime-Property erzeugen, Preis berechnen, Site Check ersetzen oder ungeprüfte AI-Ausgabe speichern. Dieses Audit implementiert keine Knowledge Base.

## 25. Quality Metrics Boundary

Die Trennung ermöglicht später Metriken ohne fachliche Ebenen zu vermischen:

- AI-Observation korrekt/falsch nach menschlicher Stichprobe;
- Observation→Descriptive-Proposal Acceptance/Correction/Rejection;
- Reviewer Correction Rate je Observation-/Property-Type;
- Hypothese später bestätigt/verworfen;
- Evidence Insufficiency/Obstruction/Wrong-Area Rate;
- Foto-Request Effectiveness bis zu suffizienter Observation;
- Conflict Rate und Zeit bis Auflösung;
- Descriptive-Fact-Nutzen für vermiedene Duplikatrequests;
- Re-review impossible rate nach Media Tombstone.

Keine personenbezogenen Bildinhalte, Prompts oder freie Kundentexte gehören in Metrics. Metrikdefinition, Rechtsgrundlage und Retention sind eigene Ownerentscheidungen; keine Metrics werden implementiert.

## 26. Customer Photo Lifecycle

Geplante Entitätskette:

`customer conversation/message → evidence request → project media → evidence identity → observations → optional descriptive claim → optional technical claim/reviewer finding`.

Originalmedium, Observation und Claim bleiben getrennte Entitäten mit eigenen IDs, Status und Retention. Kundenfotos sollen projektgebunden und mindestens durch aktive Sammlung, Interpretation, fachliche Review und Angebotserstellung referenzierbar bleiben. Message-/Providerdaten werden nicht in Observation oder Claim kopiert.

Zulässige minimale Bindungen sind `project_id`, `request_id`, `project_media_id` und `evidence_id`; Conversation/Message-Zuordnung bleibt in einem Ingestion-/Binding-Adapter. Fehlende oder uneindeutige Bindung stoppt Interpretation fail closed.

## 27. Retention Model

Noch keine Frist hardcoden. Empfohlenes späteres Statusmodell:

| Status | Zweck / Eintritt | Mindestverhalten |
|---|---|---|
| `active_collection` | offene Evidence Requests/Sammlung | Medium sichtbar und re-reviewbar |
| `offer_preparation` | Interpretation/Review/Angebotsentwurf | Medium und Evidence Chain erhalten |
| `offer_created` | Angebot erstellt | Nachvollziehbarkeit und Rückfragen ermöglichen |
| `project_active` | Auftrag/Projekt aktiv | nach Projekt-/Vertragszweck erhalten |
| `offer_closed_no_order` | Angebot ohne Auftrag geschlossen | in definierte, owner-/rechtlich freizugebende Frist überführen |
| `retention_period` | operative/rechtliche Aufbewahrungsphase | Zugriff minimiert, Löschdatum/Grund kontrolliert |
| `eligible_for_deletion` | Zweck/Frist beendet | kontrollierter Purge, Tombstone-Entscheidung anwenden |

Angebotsnachvollziehbarkeit, spätere Rückfragen, Auftrag nach Angebot und Qualitätsanalyse sind gegen Datenschutz, Datensparsamkeit, Betroffenenrechte und Re-review-Fähigkeit abzuwägen. Konkrete Fristen, Rechtsgrundlagen und Löschtrigger bleiben separate Owner-/Datenschutzentscheidung.

## 28. Media Deletion / Tombstones

Varianten:

- **A Claims mit Medium löschen:** datensparsam, zerstört aber Projektwissen/Auditkette und kann technische Historie verfälschen.
- **B Claims bleiben, Evidence Reference tombstoned:** beste fachliche Kontinuität; Re-review ist unmöglich und personenbezogene Ableitungen müssen minimiert werden.
- **C nur reviewer-approved Claims bleiben:** starke Qualitätsschwelle, verliert aber zulässige operative descriptive Facts und koppelt Retention an Rolle statt Zweck.
- **D Retention an Angebots-/Projektstatus koppeln:** sinnvoll für das Originalmedium, beantwortet aber allein nicht den Claimstatus nach Purge.

**Empfehlung: D für das Medium plus B selektiv für minimale, projekttechnische Claims.** Nach zulässigem Purge bleibt eine opaque Evidence Tombstone (`evidence_id`, Löschstatus/-zeit, kontrollierter Grund, keine URL/Pfad/PII). Technisch relevante, weiterhin zweckgebundene Claims dürfen bestehen; rein bildbezogene/PII-nahe Observations sind nach eigener Retention zu löschen oder zu minimieren. Kein Claim darf nach Tombstone so dargestellt werden, als sei Re-review möglich.

Vor Review gelöschte Medien: keine neue positive descriptive/technical Anwendung; offene Proposals werden invalidiert oder review_required/unverifizierbar. Nach Angebot gelöschte Medien: bestehende Claims können gemäß Zweck/Policy bleiben, Evidence wird tombstoned, Re-review-Fähigkeit explizit `unavailable`. Reviewer Approval ist keine pauschale Aufbewahrungserlaubnis.

## 29. Project Media Boundary

`project_media_id` ist später eine opaque Evidence Asset Reference. Conversation Intelligence darf keine Storage Paths, Bucketnamen, Signed URLs, Dateinamen oder Provider Metadata kennen. Diese bleiben in Project-Media-Services/Adaptern, die bereits private Storage-, Autorisierungs-, Gallery- und Signed-URL-Grenzen besitzen.

Der Domainvertrag darf nur minimale opaque Bindungen transportieren: `project_media_id`, `evidence_id`, `request_id`, `project_id` und, falls zwingend, `conversation_id`. Ein Storageobjekt allein ist weder Evidence-Sufficiency noch Claim.

## 30. WhatsApp Media Boundary

Geplanter, providerunabhängiger Pfad:

`WhatsApp Message → authentifizierter Media Import → Project Media → Evidence Request Matching → Evidence Identity`.

Provider-ID, Download-URL, Telefonnummernbezug, Retry und Webhookdaten bleiben im Ingestion-Adapter. Conversation Intelligence sieht weder WhatsApp Contracts noch externe URLs. Automatische Projektzuordnung, Interpretation oder Claim-Erzeugung sind nicht Teil dieses Audits.

## 31. Historical Chats Boundary

Alte Fotos dürfen nur nach nachvollziehbarer Projekt-/Conversation-Bindung, bekanntem Evidence Scope, geklärter Datenschutz-/Retention-Grundlage und eindeutiger Zuordnung als Evidence registriert werden. Unklare Zuordnung bedeutet kein Evidence Asset für Conversation Intelligence.

Keine automatische historische Fotoanalyse. Ein späterer Import muss explizit, idempotent, auditierbar und von aktuellen Requests unterscheidbar sein; historische Existenz allein löst keinen Technical Need.

## 32. Candidate Descriptive Properties

Empfohlene kleine **Owner-Entscheidungsliste**, nicht implementiert:

| Key | Entity | Value | Max Strength | Erlaubte Evidence | Claim Actor | Readiness Effect | Planner Effect | Review | Retention Dependency |
|---|---|---|---|---|---|---|---|---|---|
| `room_overview_context_observed` | `room` | boolean `true` | `descriptive_fact` | kompatible `room_overview_visible`, sufficient, eindeutiger Scope | Proposal admin/reviewer/ggf. AI; Apply zunächst reviewer/admin | nur künftige Collection Readiness | generisches Raumfoto deduplizieren | initial erforderlich | Claim darf mit Tombstone fortbestehen, Re-review markieren |
| `indoor_installation_area_observed` | `room` | boolean `true` | `descriptive_fact` | `indoor_area_visible`, sufficient | wie oben | keine Technical Readiness | generisches Innenfoto vermeiden | initial erforderlich | wie oben |
| `outdoor_installation_area_observed` | `installation` | boolean `true` | `descriptive_fact` | `outdoor_area_visible`, sufficient | wie oben | keine Technical Readiness | generisches Außenfoto vermeiden | initial erforderlich | wie oben |
| `line_route_context_observed` | `installation` | boolean `true` | `descriptive_fact` | `line_route_context_visible`, sufficient, Scope gebunden | wie oben | keine Technical Readiness | vorhandene Evidence statt generischem Request | initial erforderlich | wie oben |
| `relevant_wall_context_observed` | `room` | boolean `true` | `descriptive_fact` | explizites Observation Set aus Overview + Wall, kein Konflikt | admin/reviewer; AI-Proposal später | keine | gezieltere statt generische Nachfrage | erforderlich | wie oben |

**MVP-Empfehlung:** höchstens die ersten vier zur Contractprüfung; `relevant_wall_context_observed` zunächst Reserve. Ebenfalls Reserve: `possible_indoor_mounting_area_observed`, `possible_outdoor_mounting_area_observed`, `mounting_area_access_context_observed`, `wall_penetration_context_observed`. Kein Elektro-Key. Alle Namen sind Vorschläge, keine finalisierten Properties.

## 33. Reference Cases

| Fall | Evidence | Observation | Descriptive Fact? | Technical Claim? / Strength | Reviewer? | Site Check? | Readiness? | Planner Effect | Retention |
|---|---|---|---|---|---|---|---|---|---|
| A Fenster sichtbar | Raumfoto | `window_visible` | nein | nein; `observed` | nein | nein | nein | keiner/Reviewkontext | Observation solange Medium/Reviewzweck |
| B Tür sichtbar | Raumfoto | `door_visible` | nein | nein; `observed` | nein | nein | nein | keiner | wie A |
| C Innenwand vollständig sichtbar | Overview, behauptete Vollständigkeit | nur `wall_area_visible`; „vollständig“ nicht belegt | ggf. `relevant_wall_context_observed` nach Set | keine Eignung | ja | bei Montage/Bohrung | nein | gezieltere Nachfrage | bis Review/Offer; Tombstone markieren |
| D möglicher Innenbereich erfasst | Innenfoto | `possible_indoor_mounting_area_visible` | Reserve, nicht auto | Hypothese möglich, keine Eignung | ja | für Safety | nein | weiteres Kontextfoto evtl. unnötig | re-reviewbar bis Review |
| E Außenbereich erfasst | Außenfoto | `outdoor_area_visible` | `outdoor_installation_area_observed` möglich | nein; descriptive | initial ja | technische Folge ja | nur Collection | generisches Foto sperren | mindestens Angebotserstellung |
| F möglicher Außengerätebereich | Außenfoto | `possible_outdoor_mounting_area_visible` | Reserve | Hypothese, nie Freigabe | ja | finale Position | nein | Review statt Duplikat | bis Review/Angebot |
| G Leitungswegkontext | Routefoto | `line_route_context_visible` | möglich | keine Machbarkeit | initial ja | verdeckte Abschnitte | nur Collection | `existing_evidence` | bis Review/Angebot |
| H Wanddurchführungskontext | Routefoto | `wall_penetration_context_visible` | Reserve | keine Bohrsicherheit | ja | **ja** | nein | Site Check vormerken | bis Site Check, danach Policy |
| I Elektroanschluss | Elektrofoto | `electrical_connection_visible` | nein | keine Eignung | qualified human | regelmäßig ja | nein | ggf. gezielte Fachprüfung | bis Review, datensparsam |
| J Zugangskontext | Umfeldfoto | `accessibility_context_visible` | Reserve | keine sichere Methode | ja | bei Arbeitsmethode | nein | Review/gezieltes Bild | bis Review |
| K ergänzende Fotos | gleicher Scope, kompatible Ansichten | mehrere gültige Observations | nur per explizitem Set | Strength nicht automatisch höher | regelabhängig | unverändert | Collection-only | Coverage kann Request ändern | alle Quellen bis Review |
| L widersprüchliche Fotos | gleicher Scope, inkompatible Werte | Conflict | **nein** | kein neuer Claim | **ja** | propertyabhängig | nein | Review statt Dedupe | beide bis Auflösung |
| M schlechte Evidence | verdeckt/falsch/insuffizient | Bad-Evidence-Type | nein | nein | ggf. | nein | nein | bessere Evidence anfordern | kurze operative Retention nach Policy |
| N AI Observation | gebundenes späteres Asset | Allowlist, AI-Actor | Proposal ggf. | kein Assessment/Approval | Apply ja | kein Bypass | nein/Collection-only | kontrolliert | bis Stichprobe/Review gemäß Policy |
| O Reviewer Observation | gebundenes Asset | Allowlist, Reviewer | möglich | nur Contract-Strength | Reviewer ist Quelle | unverändert | Collection-only | Dedupe möglich | bis Zweckende |
| P Reviewer Correction | neue/erneut gelesene Evidence | neue Observation supersedes | korrigierter Fact möglich | kontrollierte Supersession | **ja** | Grenze bleibt | neu ableiten, nicht still | Planner neu berechnen | alte Kette auditierbar/minimiert |
| Q Foto nach Angebot gelöscht | purge-berechtigt | Observation ggf. minimiert | Fact kann zweckgebunden bleiben | Claim + Tombstone | Re-review unmöglich markieren | offen bleibt offen | nicht erhöhen | nur falls Fact aktiv | Tombstone, keine URL/PII |
| R Foto vor Review gelöscht | Medium fehlt | Observation nicht re-reviewbar | kein neuer/apply Claim | Proposal invalid/review_required | ja, aber ohne Medium nicht bestätigen | ggf. neue Evidence | nein | neues Foto möglich | Tombstone; minimale Metadaten |
| S Angebot ohne Auftrag | Medien in `offer_closed_no_order` | bestehend | zweckgebunden | bestehende Claims | nach Policy | offene Site Checks bleiben | unverändert | keine neue Sammlung | Ownerfrist nötig |
| T Auftrag nach Angebot | Status `project_active` | bestehend | bestehend | für Projekt nutzbar | fachlich nach Bedarf | Site Check durchführen | nur Claims | projektbezogen | Projekt-Retention |
| U Observation nach Tombstone | Original gelöscht | technische Observation minimal erhalten? | n/a | `observed`, re-review unavailable | bei Nutzung Warnung | nein | nein | vorsichtig | nur wenn Zweck/Datenschutz erlaubt |
| V Claim nach Tombstone | Original gelöscht | Referenz tombstoned | ja, selektiv | Strength unverändert, Nachweis eingeschränkt | Hinweis | Site Gate bleibt | keine neue Wirkung | bestehender Collectioneffekt ggf. Policy | Empfehlung B+D |
| W Site-check-only Property | beliebige Fotos | Kontextobservations | nein als Safetyfact | `core_drilling_safe` nur site-verified | Reviewer allein reicht nicht | **zwingend** | erst nach erlaubtem Claim | Site Check | Medium nach Projektpolicy |
| X Fact wirkt nur Planner | gültiges Außenfoto | `outdoor_area_visible` | ja | descriptive only | initial ja | nein für Fact | **keine Technical Readiness** | generischen Request vermeiden | Tombstone-fähiger Fact |

## 34. Owner Decisions

Alle Entscheidungen bleiben **OPEN / READY FOR OWNER DECISION**.

| Decision ID | Frage / Varianten | Empfehlung | Hauptrisiko | Status |
|---|---|---|---|---|
| `DTKM-01` | A Observation-only / E Hybrid | Hybrid freigeben; bis Implementation Observation-only | zweite Wahrheitsschicht | OPEN |
| `DTKM-02` | separate Property Class / gleiche Klasse | `descriptive` Class in bestehender Claim Engine | versehentliche Readinesskopplung | OPEN |
| `DTKM-03` | Strength-Allowlist ja/nein | ja, statisch/versioniert | Overclaim ohne Contract | OPEN |
| `DTKM-04` | Observation-only Types | Fenster, Tür, Wall allein, Elektro, Messreferenz, Bad Evidence | State-Aufblähung/Verlust | OPEN |
| `DTKM-05` | descriptive-fähige Types | Room/Indoor/Outdoor/Line Context eng erlauben | Scope-Verallgemeinerung | OPEN |
| `DTKM-06` | MVP Properties | höchstens erste vier aus Abschnitt 32 | zu viele Booleans | OPEN |
| `DTKM-07` | AI descriptive Proposals | später ja, nur Allowlist | AI-Fehler/Automation Bias | OPEN |
| `DTKM-08` | automatische Fact-Anwendung | zunächst nein | ungeprüfte AI-Ausgabe | OPEN |
| `DTKM-09` | Readiness A/B/C | B: nur separate Collection/Evidence Readiness | Technical Need versehentlich erfüllt | OPEN |
| `DTKM-10` | Plannerwirkung keine/eng/breit | eng registrybasiert | notwendiges Foto unterdrückt | OPEN |
| `DTKM-11` | Conflict: stop/review/quality-wins | stop; propertyabhängig Review; nie quality-wins | stiller Widerspruch | OPEN |
| `DTKM-12` | Reviewer-Schutz | bestehende Protection wiederverwenden | AI/System überschreibt Fachurteil | OPEN |
| `DTKM-13` | Foto mindestens bis Angebot | ja, durch Erstellung/Review | Datenschutz/Zweckbindung | OPEN |
| `DTKM-14` | Retention ohne Auftrag | Owner-/Datenschutzfrist nach `offer_closed_no_order` | zu lang/zu kurz | OPEN |
| `DTKM-15` | Retention bei Auftrag | projektstatus-/zweckgekoppelt | unbestimmte Dauer | OPEN |
| `DTKM-16` | Claims nach Medienlöschung A/B/C | B selektiv + D für Medium | Re-review nicht möglich | OPEN |
| `DTKM-17` | Evidence Tombstones | ja, minimal/opaque | Tombstone wird PII-Archiv | OPEN |
| `DTKM-18` | Re-review nach Löschung | explizit unavailable; neue Evidence nötig | falscher Vertrauensschein | OPEN |
| `DTKM-19` | historische Fotos automatisch/manuell/nie | nur kontrollierter manueller Import; keine Autoanalyse | Fehlzuordnung/fehlende Rechtsgrundlage | OPEN |
| `DTKM-20` | nächstes Paket | nur Descriptive Knowledge Contracts | Scope wächst bis Apply/UI | OPEN |

## 35. Recommended Packages

Kleinster sicherer Schnitt nach Ownerentscheidungen:

1. **AP-15-04-01-12-01 — Descriptive Knowledge Contracts:** Property Class, maximal vier Owner-freigegebene Keys, Strength Contract und Schemas/Registry; noch kein Mapper/Apply/Readiness/Planner.
2. **AP-15-04-01-12-02 — Observation to Descriptive Claim Proposals:** statische lossless Rules, Quality/Actor/Conflict Gates; keine Anwendung.
3. **AP-15-04-01-12-03 — Synthetic Descriptive Review / Apply Audit zuerst, Implementation danach:** Reviewer Protection, Supersession und explizite Apply Policy; keine technische Freigabe.
4. Separat: **Evidence ↔ Project Media Binding Audit**.
5. Separat: **Customer Media Retention and Tombstone Audit** mit Datenschutz-/Ownerfreigabe.
6. Erst danach separat: **Vision Adapter Audit**; WhatsApp Media Ingestion bleibt ein eigenes noch späteres Paket.

Planner-/Collection-Readiness-Integration folgt erst nach positiven Contracts und Review-Regressionen, nicht im ersten Schnitt.

## 36. Future Test Strategy

Spätere, nicht in diesem Paket implementierte Tests:

- Property-Strength-Contract vollständig, eindeutig, immutable und versioniert;
- descriptive Property Entity/Value/Strength korrekt;
- alle Observation-only Types können keinen Proposal erzeugen;
- no-overclaim für Position, Route, Elektro, Accessibility und Core Drilling;
- AI darf höchstens erlaubte Proposals, nie Apply/Assessment/Approval/Site Verification;
- Reviewer darf Site-check-only nicht umgehen; Reviewer Protection/Supersession;
- descriptive Claims verändern Technical Readiness/Missing Information nicht;
- Planner beeinflusst nur registrierte Collection-Targets;
- Multiple Evidence nur bei Scope/Set/Quality, nie „mehr = stärker“;
- Konflikt stoppt Proposal und bleibt sichtbar;
- Media deletion/tombstone invalidiert Re-review und wahrt erlaubte Claimhistorie;
- Retention-State-Transitions und Löschberechtigung;
- deterministische Proposal-IDs/-Resultate bei injizierten IDs/Zeitpunkten;
- strict Contracts ohne Storagepfad, Bucket, Signed URL oder Providerdaten;
- keine WhatsApp-, Vision- oder Storage-Abhängigkeit in Conversation Intelligence;
- historische ungebundene Evidence fail closed;
- package-/schemaübergreifende Regression für bestehende Contradictions und Readiness.

## 37. Production Gates

Vor produktiver Nutzung müssen mindestens erfüllt sein:

1. Ownerfreigabe aller `DTKM-*`-Entscheidungen im jeweils nötigen Umfang;
2. versionierter Property-Strength- und Actor-Contract;
3. nachgewiesene Observation-only-/No-overclaim-Grenzen;
4. getrennte Technical- und Collection-Readiness;
5. Reviewer-/Site-Check-Qualifikations- und Schutzmodell;
6. Project-Media-/Evidence-Binding mit Autorisierung und Idempotenz;
7. Datenschutzfreigabe für Fotozweck, Retention, Löschung und Tombstones;
8. Re-review- und Correction-Workflow;
9. historische Importregeln;
10. fokussierte Tests, Typecheck, Lint, Security-/Privacy-Review und Production Validation der späteren Implementierung.

Dieses Audit selbst schaltet kein Gate frei.

## 38. Scope Confirmation

Ausdrücklich bestätigt:

- ausschließlich Audit; keine Property-Implementierung;
- keine Schema-, Claim-Erzeugungs-, Knowledge-State-Mutations-, State-Transition-, Readiness- oder Planneränderung;
- keine UI, Simulatoränderung oder Tests;
- keine Persistenz, DB, Migration, SQL, RPC, RLS oder Supabase-Änderung;
- kein Storage, Upload oder Project-Media-Binding;
- keine Vision, KI oder WhatsApp-Integration;
- keine Knowledge Base oder Metrics;
- keine `package.json`-Änderung.

Es wurde exakt eine neue Auditdatei geplant; keine Anwendungsdatei wird geändert und keine Anwendungstests werden ausgeführt.

## 39. Status

**Auditstatus: READY FOR OWNER DECISION**

**EVIDENCE OBSERVATION DOMAIN — IMPLEMENTED**

**OBSERVATION TO CLAIM MAPPING — IMPLEMENTED**

**AUTO-PROPOSABLE OBSERVATION RULES — CURRENTLY EMPTY**

**DESCRIPTIVE TECHNICAL KNOWLEDGE MODEL — NOT IMPLEMENTED**

**DESCRIPTIVE PROPERTY REGISTRY — NOT IMPLEMENTED**

**OBSERVATION CLAIM APPLICATION — NOT IMPLEMENTED**

**CUSTOMER PHOTO PROJECT BINDING — NOT IMPLEMENTED**

**CUSTOMER PHOTO RETENTION POLICY — NOT FINALIZED**

**REAL PROJECT MEDIA EVIDENCE BINDING — NOT IMPLEMENTED**

**VISION ANALYSIS — NOT IMPLEMENTED**

**WHATSAPP MEDIA COLLECTION — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**

## AP-15-04-01-12-01 Descriptive Knowledge Contracts Result

### Finalisierte Ownerentscheidungen

Das konservative Hybridmodell ist als reiner Domainvertrag umgesetzt. Descriptive Technical Knowledge nutzt die bestehende Claim-, Evidence-, Contradiction- und Supersession-Architektur; es gibt weder einen zweiten Knowledge State noch Persistenz oder Laufzeitanwendung aus Observations. Bestehende Technical Properties behalten ihre Bedeutung.

### Strength Ladder und Property Classes

Die geschlossene Strength-Ladder lautet `observed`, `descriptive_fact`, `technical_hypothesis`, `technical_assessment`, `reviewer_approved`, `site_verified`. `observed` bleibt primär die Observation-Ebene; neue descriptive Claims benötigen ausdrücklich `descriptive_fact`. Die geschlossenen Property Classes sind `descriptive`, `technical`, `safety_critical` und `site_check_only`.

### Property Strength Registry

Eine statische, tief unveränderliche Registry bindet jeden vorhandenen Property Key an Entity, Value Type, Property Class, minimale und maximale Strength, Epistemic Status, Actor Classes, Technical-Readiness-Effekt, Planner-Kontext-Effekt, Human Review und Site-Check-Grenze. Die pure Validierung weist zu niedrige oder zu hohe Strength, falsche Actors und unzulässige Epistemik fail closed ab. Die Registry ist keine Runtime- oder Datenbankkonfiguration.

### Kleine descriptive Allowlist

Freigegeben sind ausschließlich fünf boolesche Kontextfacts: `room_overview_context_observed`, `indoor_installation_area_observed`, `outdoor_installation_area_observed`, `line_route_context_observed` und `wall_penetration_context_observed`. Ihr einziger positiver Wert `true` bedeutet, dass der eng benannte visuelle Kontext erfasst wurde. Alle besitzen Minimum und Maximum `descriptive_fact`, Epistemik `observed`, Technical-Readiness-Effekt `none` und initiale Human-Review-Pflicht. Der Penetration-Fact bleibt ausdrücklich bloßer Review-Kontext; er bestätigt keine Bohrsicherheit.

### Bewusst Observation-only verbleibende Werte

`window_visible`, `door_visible`, `measurement_reference_visible`, `electrical_connection_visible`, `room_overview_visible`, Bad-Evidence-Befunde und weitere rohe sichtbare Merkmale bleiben Observations. Insbesondere wurden keine Properties für Elektro-Eignung, Bohrsicherheit, finale Montagefreigabe, Schallfreigabe oder Statikfreigabe geschaffen.

### Actor Boundary

AI, Admin und Reviewer dürfen vertragsseitig descriptive Facts vorschlagen, können das Property-Maximum aber nicht überschreiten. Customer und System sind dafür nicht freigegeben. Reviewer/Admin können weder Maximum noch eine Site-Check-Grenze umgehen. Dieses Paket implementiert keine Proposal Rule und kein Apply.

### Readiness-, Missing-Information-, Planner- und Information-Gain-Grenze

Descriptive Facts verändern weder Technical Readiness noch Readiness Dimensions oder Levels und entfernen keinen Technical Missing Blocker. Die Registry darf ausschließlich `evidence_context_satisfied` beziehungsweise `human_review_context` als späteren Planner-Kontext ausdrücken. Dadurch wird noch keine Planner Progression und keine Information-Gain-Logik verändert; ein Evidence-Kontext darf später einen Erhebungsweg deduplizieren, aber niemals einen Technical Need erfüllen.

### Photo Lifecycle Boundary

Es wurde bewusst kein neuer Lifecycle-Statuscontract implementiert: Fristen, Löschautomatik, Persistenz und Project-Media-Bindung gehören in ein späteres Medien-/Datenschutzpaket. Die Retention-Invariante bleibt bestehen: Original Customer Media soll mindestens durch Collection, Interpretation, Review und Angebotserstellung projektgebunden referenzierbar bleiben. Eine konkrete Retentiondauer ist nicht finalisiert.

### Tests und Remaining Limits

Fokussierte Tests decken geschlossene/strikte Strengths, Registry-Vollständigkeit, Eindeutigkeit und tiefe Immutability, Entity-/Value-Bindung, die kleine Allowlist, Unsafe-Key-Ausschlüsse, Actor-/Strength-Grenzen, unveränderte Readiness und Missing Information sowie die weiterhin leere `auto_proposable`-Teilmenge ab. Nicht implementiert bleiben Observation→descriptive Mapping, Claim Application, Knowledge-State-Mutation aus Observations, Planner-/Information-Gain-Laufzeitlogik, Customer Media, Persistenz, Vision und externe Kanäle.

`DESCRIPTIVE KNOWLEDGE CONTRACTS — IMPLEMENTED`

`KNOWLEDGE STRENGTH MODEL — IMPLEMENTED`

`PROPERTY STRENGTH REGISTRY — IMPLEMENTED`

`SMALL DESCRIPTIVE PROPERTY ALLOWLIST — IMPLEMENTED`

`DESCRIPTIVE FACT TECHNICAL READINESS EFFECT — NONE`

`OBSERVATION TO DESCRIPTIVE CLAIM MAPPING — NOT IMPLEMENTED`

`DESCRIPTIVE CLAIM APPLICATION — NOT IMPLEMENTED`

`CUSTOMER PHOTO PROJECT BINDING — NOT IMPLEMENTED`

`CUSTOMER PHOTO RETENTION POLICY — NOT FINALIZED`

`VISION — NOT IMPLEMENTED`

`WHATSAPP — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`
