# AP-15-04-01-12-03 — Human-Controlled Descriptive Claim Review and Apply Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-20-AP15-04-01-12-03-HUMAN-CONTROLLED-DESCRIPTIVE-CLAIM-APPLY-V1` |
| Datum | 2026-08-20 |
| Audit-Branch | `codex/audit-ap15-04-01-12-03-descriptive-claim-apply` |
| Ausgangsbranch | `work` |
| Baseline-HEAD | `d00f93782a9f757b224ad1347b754ed3aa4ecf82` |
| Remote Status | Kein Git-Remote konfiguriert; Fetch, Ahead/Behind und Remote-Baseline sind nicht bestimmbar. |
| Grundlage | AP-15-04-01-12 vollständig einschließlich Result 12-01/12-02; AP-15-04-01-09 vollständig einschließlich Result 10/11; gesamte aktuelle Conversation-Intelligence-Domain; Rollen, Permissions, Audit-Log, Correction- und Server-/Service-Grenzen. |
| Auditstatus | **READY FOR OWNER DECISION** |

## 2. Scope

Dieses Paket ist ausschließlich Audit und Architekturplanung. Es untersucht den menschlich kontrollierten Review-/Apply-Pfad nur für `room_overview_context_observed`, `indoor_installation_area_observed`, `outdoor_installation_area_observed`, `line_route_context_observed` und `wall_penetration_context_observed`. Neue Properties sind nicht Teil des MVP; eine spätere Erweiterung benötigt ein eigenes Property-/Mapping-Audit.

Nicht im Scope sind Implementierung, Apply, Claim-/State-Mutation, Transition-/Permission-/UI-/Simulatoränderung, Persistenz, DB, Migration, SQL, RPC, RLS, Supabase, Storage, Project Media, Vision/KI, WhatsApp, Knowledge Base, Metrics, Tests und `package.json`.

## 3. Current Pipeline

Implementiert ist `Evidence Request → Orchestration → Evidence Availability → EvidenceObservation → synthetische Interpretation → Observation-to-Claim Mapping → KnowledgeClaimProposal → STOP`. Genau fünf statische, target-/actor-/quality-gebundene Regeln erzeugen Boolean `true`, `descriptive_fact`, `observed`; sie mutieren nichts.

Der autoritative Knowledge-Pfad besitzt immutable Claims, effektive Claims, Contradictions, Supersession, `StateTransitionProposal` und `applyStateTransitionProposal(...)`. Der Apply prüft Projekt/Conversation, Basis- und Zielversion, Proposal-/Evidence-Schemas, ID-Konflikte, Supersession und Reviewer-Schutz. Er kennt `N→N+1`, no-change `N→N` sowie `already_applied`. Conversation Intelligence ist nicht persistent.

Ist-Lücken: Es gibt keinen Review-Contract, keine Proposal-Review-Identität/Fingerprint-Bindung, keinen Reviewstatus, keine zentrale Apply-Permission, keinen fachlichen Review-Audit-Event und keine atomare persistente Workflowgrenze. Der heutige `StateTransitionProposal` ist zudem answer-spezifisch (`answer_id`, `retry_outcome`, `information_key`, Interpretation-Metadaten). Er ist als Apply-Grenze wiederzuverwenden, reicht aber nicht unverändert als öffentliches Review-Kommando oder persistenter Review-Record.

## 4. Core Safety Invariant

Ein angewendeter Claim bedeutet ausschließlich: **„Dieser projektfachlich relevante Kontext wurde auf Basis kontrollierter Evidence beobachtet.“** Er bedeutet nicht technisch geeignet/freigegeben, Montage möglich, Position bestätigt, Leitungsweg machbar, Kernbohrung sicher, Elektro geeignet oder Angebot fachlich final.

Für alle fünf Fälle gelten unveränderlich: `value=true`, `knowledge_strength=descriptive_fact`, `epistemic_status=observed`, `technical_readiness_effect=none`. Human Review bestätigt nur die Zulässigkeit der schwachen Zusammenfassung, nicht technische Wahrheit. UI, Domain und Persistenz dürfen keine Eskalationsoption anbieten.

## 5. Architecture Variants

Bewertung 1 (schwach) bis 5 (stark); bei Komplexität bedeutet 5 einfach.

| Kriterium | A alles auto | B alles Admin/Reviewer | C AI Review, Human auto | D property-spezifisch | E MVP alles Review, später Metrics |
|---|---:|---:|---:|---:|---:|
| Sicherheit | 1 | 5 | 3 | 3 | 5 |
| Fachlichkeit | 1 | 5 | 3 | 4 | 5 |
| Laurie-Workflow | 1 | 5 | 3 | 4 | 5 |
| Admin UX | 5 | 3 | 4 | 4 | 3 |
| Reviewer-Rolle | 1 | 5 | 4 | 4 | 5 |
| AI-Zukunft | 2 | 3 | 4 | 5 | 5 |
| Auditierbarkeit | 1 | 5 | 3 | 4 | 5 |
| Fehlerratenmessung | 1 | 5 | 3 | 4 | 5 |
| Skalierbarkeit | 5 | 2 | 4 | 5 | 4 |
| Geschwindigkeit | 5 | 2 | 4 | 4 | 3 |
| WhatsApp-Eignung | 2 | 3 | 4 | 4 | 4 |
| Vision-Eignung | 1 | 3 | 4 | 5 | 5 |
| Knowledge-Base-Grenze | 2 | 5 | 3 | 4 | 5 |
| MVP-Komplexität | 5 | 3 | 3 | 2 | 3 |

A ist nicht freigabefähig. B ist sicher, bietet aber keinen kontrollierten Lernpfad. C verwechselt menschlichen Ursprung mit geprüfter Dauerhaftigkeit. D ist ein sinnvolles späteres Ziel, heute aber ohne Ground Truth verfrüht. E schafft sicheren Betrieb und property-/actor-spezifische Messbarkeit, ohne Auto-Apply vorwegzunehmen.

## 6. Recommended Architecture

**Empfehlung: Variante E.** Im MVP wird jedes der fünf Proposals explizit von einem berechtigten Menschen geprüft. Pfad: `Descriptive Claim Proposal → Human Review → serverseitig rekonstruierte kontrollierte StateTransitionProposal → bestehende applyStateTransitionProposal(...) Grenze`.

Das kleinste Paket bleibt Simulator-only, Admin-only und pure. Reviewer-Freischaltung, Persistenz und selektives Auto-Apply sind separate Owner-/Implementierungsentscheidungen. Reject/insufficient mutieren den Knowledge State nicht. Apply erzeugt niemals Supersession; Konflikte gehen in Review/Correction.

## 7. Actors

| Actor | Proposal | Review/Apply MVP | Zielmodell | Grenze |
|---|---|---|---|---|
| `admin` | ja | ja | mit zentraler Capability | keine Strength-/Site-Check-Eskalation |
| `reviewer` | ja | nein im kleinsten Paket | ja, nur nach expliziter Capability-Freigabe | keine neue DB-Rolle |
| `ai` | ja | nie | Proposal-Quelle, niemals Self-Approval | kein menschlicher Actor |
| `system` | nein für gesehenen Kontext | nie | nur technische Orchestrierung | kein Human Review |
| `customer` | liefert Evidence | nie | keine interne Claim-Freigabe | Clientangabe ist keine Autorität |

## 8. Permissions

Bestehend sind zentrale rollenbasierte Mapper für fachliche Aktionen; `admin` und `reviewer` sind die einzigen DB-Rollen. Für das MVP notwendig sind getrennt `canReviewDescriptiveClaimProposal`, `canApplyDescriptiveClaim` und `canRejectDescriptiveClaimProposal`; damit kann Review-Sichtbarkeit von Mutation und Ablehnung getrennt freigegeben werden. Admin erhält alle drei im synthetischen Paket; Reviewer zunächst keine neue Capability.

`canReviewEvidenceObservation` und `canCorrectEvidenceObservation` sind fachlich sinnvoll, aber nicht Bestandteil des Apply-MVP und müssen im Observation-Correction-Paket entschieden werden. Eine zusätzliche `canCorrectKnowledgeClaim` gehört in den separaten Claim-Correction-Workflow. Capabilities dürfen nicht allein aus Clientdaten oder UI-Sichtbarkeit folgen.

## 9. Review Contract

Geschlossene Review-Result-Union:

| Result | Bedeutung | Apply |
|---|---|---|
| `approved` | Proposal als schwacher Fact zulässig | ja, sofern CAS/Conflict-Gates passieren |
| `rejected` | nicht als langlebiger Fact übernehmen | nein |
| `needs_correction` | Observation/Binding muss separat korrigiert werden | nein |
| `insufficient_evidence` | Evidence trägt langlebigen Fact nicht | nein; neue Evidence möglich |
| `site_check_required` | technische Folge bleibt Vor-Ort-Thema | nein |
| `conflict_detected` | bestehender State verhindert stillen Apply | nein |
| `superseded` | Proposal ist durch kontrollierte neuere Entscheidung ersetzt | nein |
| `no_change` | äquivalenter Claim ist bereits aktiv | nein, idempotenter Erfolg |

`already_applied` ist ein Apply-/Replay-Resultcode, keine neue fachliche Reviewentscheidung. Freitext ist nie autoritativ. Ein späterer optionaler strukturierter Kommentar ist getrennt, längenbegrenzt, nicht PII-haltig und nicht entscheidungssteuernd.

## 10. Apply Contract

Der strikte server-/domaininterne Context bindet `project_id`, `conversation_id`, opaque `proposal_id`, `claim_id`, `expected_knowledge_state_version`, serverseitig ermittelten `reviewer_actor_id`, Proposal-Fingerprint und Rule-/Proposal-Version, geschlossene `review_decision` und injiziertes `occurred_at`. Zusätzlich sind servergenerierte `review_id`, `apply_id` und Transition-ID für Idempotenz/Audit sinnvoll.

Der Fingerprint umfasst kanonisch Proposal-ID, Rule-Version, Project/Conversation/Target, Claim-ID, Property, Boolean-Wert, Strength, Epistemik und sortierte opaque Evidence-Identitäten/-Versionen; kein Raw Payload. Apply akzeptiert ausschließlich `approved`; alle übrigen Results erzeugen keine State Transition mit Claims. Verboten sind E-Mail, Client-Actor-ID als Autorität, freie Property/Strength/Wert, Raw Observation, URL, Storagepfad und Kundentext.

## 11. Client Boundary

Maximaler Clientinput: `{ proposal_ref, expected_knowledge_state_version, action }`, wobei `action` zunächst `approve | reject | mark_insufficient_evidence` ist. Selbst `project_id`/`conversation_id` sollten aus der serverseitig geladenen Proposal-Bindung stammen; falls Routing sie mitliefert, sind sie nur Lookup-Scope und müssen exakt abgeglichen werden.

Der Server authentifiziert, lädt Profil/Capabilities und Proposal, prüft Status/Fingerprint/Version/Projektzugriff und rekonstruiert Property, `true`, `descriptive_fact`, `observed`, Evidence, Actor-Ursprung, Target, Project und Conversation aus autoritativen Daten. Der Client baut niemals Claim, Evidence oder Actor.

## 12. State Transition Reuse

Zwingend wiederverwenden: `StateTransitionProposal` plus `applyStateTransitionProposal(...)`; keine zweite `addClaim`-/`supersedeClaim`-Mutation. Ein Review-Domainadapter erzeugt nach Approval eine kontrollierte `claim_created`-Transition mit genau einem validierten Proposal, Basis `N`, Ziel `N+1`, keinen `superseded_claim_ids` und derselben Evidence-Bindung.

Die bestehende Apply-Grenze deckt Schema-, Projekt-/Conversation-, Version-, Claim-/Evidence-ID-, Supersession- und Reviewer-Schutz bereits wesentlich ab. Vor Implementierung ist der answer-spezifische Transition-Contract zu entkoppeln oder durch einen kontrollierten Builder mit eindeutig nicht irreführenden Metadaten zu bedienen; Dummy-`answer_id`/`retry_outcome` sind nicht zulässig. `EvidenceProposal.evidence_status` ist derzeit enger als der allgemeine Evidence-Status. Diese Contract-Lücken gehören in 03-01, nicht in eine parallele Mutationsengine.

## 13. Knowledge Version / CAS

Echte Änderung exakt `N→N+1`; `no_change`/`already_applied` exakt `N→N`. Keine Fake-Version und kein Retry mit stillschweigend aktualisiertem Expected-Wert. Der Server vergleicht erwartete Reviewversion, Proposal-Basisversion und aktuell gespeicherte Stateversion; Stale State failt geschlossen (`state_version_mismatch`/fachlich `conflict_detected`) und verlangt Reload/Re-Evaluation.

In-memory genügt pure Validierung im Simulator. Persistent ist CAS im selben atomaren Repository-/DB-Schritt erforderlich; bloßes Read-then-write im Server Action ist nicht ausreichend.

## 14. Idempotency

Idempotency-Key bindet Proposal-ID + Proposal-Version/Fingerprint + Reviewaction. Gleiche Approval-Wiederholung liefert genau einmal Apply/Audit, danach `already_applied`; zwei Tabs und Admin/Reviewer-Race haben einen Gewinner. Ein verworfenes/superseded Proposal kann nicht reaktiviert werden. Stateänderung zwischen Review und Apply stoppt CAS. Gleiche Proposal-ID mit anderem Fingerprint ist Manipulation/Conflict, nicht Retry.

## 15. Duplicate Claims

Vor Transition wird anhand effektiver Claim-Semantik (Project, Entity, Property, `true`, `descriptive_fact`, `observed`) geprüft. Äquivalent aktiv ergibt `no_change`, State `N`, keine zweite Claimzeile und kein Apply-Audit-Duplikat. Ein fachliches Review-Ergebnis darf einmal als no-change protokolliert werden; Replays desselben Reviewcommands erzeugen kein weiteres Event.

## 16. Conflicts

Abweichender aktiver Claim wird niemals automatisch überschrieben: descriptive gegen descriptive, AI-Proposal gegen Admin-/Reviewer-Claim, Admin-Proposal gegen Reviewer-Correction und unterschiedliche Evidence führen zu `conflict_detected`/Human Correction. Unterschiedliche Evidence bei semantisch identischem Fact ist kein Grund für eine zweite Zeile; Evidence-Erweiterung wäre ein eigenes Contractpaket.

Bestehende Contradiction-/Supersession-Architektur bleibt autoritativ. Der Review-Apply-Builder setzt im MVP kein `supersedes_claim_id`. Ein Konflikt kann nur über einen expliziten Correction-/Supersession-Workflow aufgelöst werden.

## 17. Reviewer Protection

Reviewer- oder `manually_corrected` Claims dürfen niemals durch AI, System oder Auto-Apply überschrieben werden; der bestehende Apply schützt Supersession bereits. Auch Admin darf im MVP einen Reviewer-Claim nicht still korrigieren. **Ownerempfehlung:** Admin-Korrektur nur über expliziten, auditierbaren Correction-Workflow mit Reason Code, erwarteter Version und Schutzprüfung; keine implizite Rollenpriorität.

## 18. Rejection

Ablehnung lässt Knowledge State und Observation unverändert. Sie bedeutet nur „dieses Proposal wird nicht als langlebiger Fact übernommen“, nicht „Observation falsch“. Später erhält das Proposal einen kontrollierten terminalen Reviewstatus; Replay ist idempotent. Ein neues Proposal benötigt neue Identität/Version oder kontrollierte Supersession, nicht das Umschreiben der Ablehnung.

## 19. Correction

Strikt getrennte Aggregate/Vorgänge: (1) Observation Correction korrigiert Interpretation/Target/Quality mit neuer Identität und Historie; (2) Proposal Rejection bewertet nur Übernahme; (3) Knowledge Claim Correction erzeugt kontrollierte Claim-Supersession. Keiner darf den anderen implizit auslösen. `needs_correction` verweist nur in Workflowrichtung und mutiert nichts.

## 20. Evidence Quality

Nur die bereits proposal-fähige Qualität `sufficient_for_observation` kann approved werden. `insufficient`, `ambiguous`, `wrong_target`, `obstructed` sowie invalid/partial dürfen nicht durch Human Review hochgestuft werden. Reviewer kann separat Observation korrigieren, Evidence unbrauchbar markieren oder neue Evidence anfordern, aber weder Strength noch Site-Check-/Safety-Grenzen umgehen.

## 21. Strength Boundary

Apply der fünf Properties ist ausschließlich `knowledge_strength=descriptive_fact`. Property Registry und serverseitige Rekonstruktion sind autoritativ. Keine Review-/UI-Aktion darf `technical_hypothesis`, `technical_assessment`, `reviewer_approved` oder `site_verified` wählen; diese benötigen getrennte Workflows und Property-Contracts.

## 22. Epistemic Boundary

Apply ist ausschließlich `epistemic_status=observed`. Approval darf nicht `confirmed` erzeugen. Der Reviewer bestätigt die zulässige deskriptive Zusammenfassung, nicht die technische Richtigkeit, Vollständigkeit oder Eignung des abgebildeten Sachverhalts.

## 23. Readiness

Harte Invariante: erfolgreiche Anwendung verändert Technical Readiness exakt nicht. Kein Level, keine Dimension, kein Score, kein Allowed/Prohibited Output wird besser. `outdoor_installation_area_observed=true` lässt insbesondere `outdoor_unit_position_known` offen.

## 24. Missing Information

Technical Missing Information bleibt exakt unverändert. Kein descriptive Fact entfernt, schwächt oder verschiebt einen technischen Blocker; Outdoor-Position, Leitungsweg, Elektro, Bohrsicherheit und Zugänglichkeit bleiben nach ihren Technical Contracts offen.

## 25. Planner / Information Gain

Später zulässig: ein angewendeter Fact markiert nur `evidence_context_satisfied` bzw. bei Wanddurchführung `human_review_context`, verhindert eine identische generische Fotoanforderung oder ändert den Erhebungsweg von `future_photo_request` zu `existing_evidence`. Nicht zulässig: Technical Need erfüllen, Progressionsdependency schließen, Eignung annehmen, Site Check/Assessment unterdrücken oder Information Gain als technische Klärung zählen. Wirkung muss über statische Registry erfolgen, nie `*_observed`-Stringheuristik. Noch keine Planneränderung.

## 26. Human Review UX

Kleine interne Karte: Evidence-Kontext/opaque Vorschauzugriff → strukturierte Observation → verständlicher Proposal-Satz → Status „Noch nicht übernommen“ → Strength „Deskriptiver Fakt“ → Warnung „Keine technische Freigabe“. Aktionen: „Übernehmen“, „Ablehnen“, optional „Evidence nicht ausreichend“. Verboten: „Montage freigeben“, „Technisch geeignet“, „Angebot freigeben“ und Strength-Auswahl.

Reviewer sieht Observation, zugrunde liegende Evidence, vorgeschlagenen Fact, explizite Nicht-Bedeutung sowie Conflict-/Protection-Status. Keine Chain-of-Thought, AI-Begründung oder freie Providerausgabe; nur strukturierte Reason Codes und Evidence.

## 27. Laurie Workflow

Im späteren Intelligence Workspace sieht Laurie Projekt, autorisierten Evidence-Kontext, „Außenbereich sichtbar“, „Außeninstallationsbereich wurde visuell erfasst“, Strength „Deskriptiver Fakt“ und „Technical effect: Keine technische Freigabe“. Sie kann übernehmen/ablehnen; bei schlechter Evidence in einen separaten Korrektur-/Neuanforderungspfad wechseln. Korrekturen bleiben später als strukturierte Quality Cases messbar, ändern aber keine Regel automatisch.

## 28. Audit Logging

Für echten Apply sanitisiert: Actor-UUID, Project-UUID, Proposal-/Claim-UUID, Property Key, vorherige/neue Stateversion, Resultcode und Timestamp; zusätzlich Review-/Apply-ID und Proposal-Version sinnvoll. Nicht loggen: E-Mail, Bild, Signed URL, Storagepfad, Customer Message, Vision Prompt, Providerantwort oder freie PII.

Das bestehende `audit_log` hat UUID, `actor_id`, freien Entitytyp/-ID, Action, JSON-Metadata und Zeit; Clientrollen haben keinen Schreibzugriff. Es eignet sich als knapper unveränderlicher Security-/Decision-Trail, aber nicht als autoritativer Reviewstatus oder Workflowstore. Kontrollierte Action-/Resultcodes und sanitisiertes Metadata-Schema sind vor Persistenz festzulegen.

## 29. Atomicity

Simulator: bestehende pure In-Memory-/Service-Grenze genügt. Produktion: Proposal-Reviewstatus, CAS-Apply des Knowledge State und genau ein Review/Audit Event müssen atomar committen oder vollständig scheitern. Wegen fehlender Conversation-State-Persistenz wird heute weder RPC noch Tabelle vorweggenommen. Später ist ein persistenter Conversation-State-Repository-Schritt erforderlich; dessen Adapter kann eine DB-Transaktion/RPC verwenden. `audit_log` allein ist kein Lock und kein Workflowstore.

## 30. Synthetic Simulator Apply

Empfohlenes kleinstes Paket: ausschließlich lokaler Simulator, synthetisches Proposal, Admin klickt „Übernehmen“/„Ablehnen“, kontrollierter Builder, bestehende pure Transition, descriptiver Claim im lokalen State, Readiness/Missing unverändert. Keine Persistenz, echtes Medium, Vision, Reviewer-Freischaltung oder Plannerwirkung.

## 31. Auto-Apply Decision

Varianten „nie“, „alle fünf“, „nur Human-Observation“, „AI erst nach Review“ und „MVP alles Review; später selektiv nach Metrics“ wurden geprüft. Empfehlung **E**: heute kein Auto-Apply; später nur property-/actor-/rule-version-spezifisch nach ausreichender Ground-Truth-naher Correction-/Site-Check-Historie, expliziter Ownerfreigabe, Rollback und fortlaufendem Monitoring. Human-Ursprung allein ist kein Auto-Apply-Beweis.

## 32. Quality Metrics

Zukünftige strukturierte Events: proposal generated/approved/rejected, observation corrected, claim later corrected, site check contradicts claim. Ableitungen: Approval-, Rejection-, Correction-Rate, AI-vs-human agreement und property-/actor-/rule-version-spezifische Error Rate. Nenner, Zeitfenster und verzögerte Korrekturen müssen definiert sein. Keine pauschale „AI Accuracy“ ohne Ground Truth; Approval ist nicht Ground Truth.

## 33. Knowledge Base Boundary

Reviewer Correction → später strukturierter Quality Case → kuratierter Vorschlag zur Rule-/Knowledge-Base-Verbesserung. Niemals direkte Regeländerung. Knowledge Base und Mapping Registry bleiben getrennt versioniert, getestet und menschlich freigegeben; dieses Paket implementiert beides nicht.

## 34. Customer Photo Lifecycle

Original Customer Media muss mindestens durch Collection, Interpretation, offenen Review und Angebotserstellung projektgebunden autorisiert referenzierbar bleiben. Offene Proposals blockieren die fachliche Löschfreigabe ihrer Evidence; keine konkrete Frist wird festgelegt. Ein offenes Proposal ohne überprüfbares Originalmedium wäre nicht sachgerecht reviewbar und muss fail closed statt automatisch approved werden.

## 35. Media Deletion / Tombstone

Nach abgeschlossenem Review/Offer und späterer Retention-Löschung kann ein bereits angewendeter schwacher Claim fortbestehen, sofern Policy und Provenienzcontract dies erlauben. Die opaque Evidence Reference wird tombstoned, nicht auf eine tote URL umgebogen. Konsequenzen: eingeschränkter Re-Review, sichtbarer Evidence-unavailable-Status, keine nachträgliche Strength-Erhöhung und gegebenenfalls neue Evidence vor Correction/technischer Nutzung. Offene Reviews verhindern Löschung; Tombstone löscht nicht rückwirkend die historische Reviewentscheidung.

## 36. Reference Cases

Legende: Version `N→N+1` nur bei Apply; `N→N` sonst. Readiness (`R`) und Technical Missing (`M`) bleiben stets unverändert.

| Fall | Actor | Proposal / Existing State | Review decision | Apply / Version | R / M | Planner implication | Audit implication |
|---|---|---|---|---|---|---|---|
| A Room overview approved | Admin | Room-Fact / kein Claim | approved | ja, N→N+1 | gleich / gleich | später generisches Room-Foto deduplizierbar | einmal approved+applied |
| B Indoor approved | Admin | Indoor-Fact / leer | approved | ja, N→N+1 | gleich / gleich | nur Indoor-Evidencekontext | einmal Apply |
| C Outdoor approved | Admin | Outdoor-Fact / Position offen | approved | ja, N→N+1 | gleich / gleich | nur Outdoor-Fotoduplikat | einmal Apply |
| D Line-route approved | Admin | Route-Kontext / Route offen | approved | ja, N→N+1 | gleich / gleich | nur Evidencekontext | einmal Apply |
| E Penetration approved | Admin | Penetration-Kontext / Bohrung offen | approved | ja, N→N+1 | gleich / gleich | Human-review-context, kein Site-Check-Ersatz | einmal Apply |
| F Rejected | Admin | gültiges Proposal / leer | rejected | nein, N→N | gleich / gleich | offen/ggf. neue Evidence | Review einmal, kein Apply |
| G Evidence insufficient | Admin | schlechte Evidence | insufficient_evidence | nein, N→N | gleich / gleich | neue Evidence anfordern | Reason Code, kein Claim |
| H Duplicate approval | Admin | Proposal bereits applied | approved→already_applied | nein, N→N | gleich / gleich | unverändert | kein Duplikat |
| I Two-tab approval | Admin | beide Basis N | erster approved, zweiter replay/stale | einmal, N→N+1 | gleich / gleich | einmal | genau ein Apply-Audit |
| J Admin+Reviewer race | beide berechtigt | gleiche Basis N | beide approved | ein Gewinner, N→N+1 | gleich / gleich | einmal | zweiter already_applied/conflict |
| K Stale version | Admin | State N+1, expected N | approved | nein, N+1→N+1 | gleich / gleich | replan/review | CAS conflict |
| L Equivalent exists | Admin | gleicher aktiver Fact | no_change | nein, N→N | gleich / gleich | Evidencekontext bereits da | einmal no_change, kein Claim |
| M Conflicting descriptive | Admin | abweichender effektiver Claim | conflict_detected | nein, N→N | gleich / gleich | Review/Correction | Conflictcode |
| N Reviewer protected | Admin/AI | Reviewer-Claim aktiv | conflict_detected | nein, N→N | gleich / gleich | keine Überschreibung | protected result |
| O AI proposal/Admin review | Admin | AI-Ursprung, gültig | approved | ja, N→N+1 | gleich / gleich | nur Kontext | Actor und Ursprung getrennt |
| P AI proposal/Reviewer review | Reviewer mit Capability | AI-Ursprung | approved | ja, N→N+1 | gleich / gleich | nur Kontext | Reviewer UUID, AI Source |
| Q AI self-approve | AI | eigenes Proposal | rejected by authorization | nein, N→N | gleich / gleich | keiner | denied, kein fachlicher Apply |
| R Customer approve | Customer | beliebig | rejected by authorization | nein, N→N | gleich / gleich | keiner | denied, keine interne Freigabe |
| S Readiness invariant | Admin | beliebiger Fact | approved | ja, N→N+1 | exakt gleich / gleich | Collection-only | Versionsdelta dokumentiert |
| T Missing invariant | Admin | Outdoor, Position fehlt | approved | ja, N→N+1 | gleich / Position fehlt | nur Evidence | keine Missing-Entfernung |
| U Outdoor dedup only | Admin | Outdoor Fact aktiv | approved | ja | gleich / gleich | future photo→existing evidence erlaubt | Planner später separat |
| V Dependency not satisfied | Admin | Route Fact, Route unbekannt | approved | ja | gleich / gleich | technical dependency offen | kein Progressionsevent |
| W Photo deleted after retention | System-Retention nach Abschluss | Claim applied | superseded/no review | nein | gleich / gleich | Tombstone sichtbar | Löschung separat auditieren |
| X Early deletion attempt | System/Admin | offenes Proposal | policy denied | nein | gleich / gleich | Review bleibt möglich | deny reason, kein Medieninhalt |
| Y Reviewer correction after apply | Reviewer | aktiver Fact | needs_correction/separater Workflow | kein Apply hier | gleich / gleich | Fact nicht still nutzen | Correction separat auditieren |
| Z Observation invalidated | Reviewer | Claim beruht darauf | needs_correction | kein stiller Delete | gleich / gleich | Review/Correction nötig | Observation und Claim getrennt |
| AA Proposal replay | Admin | gleiche ID/Fingerprint/Action | already_applied/no_change | nein, N→N | gleich / gleich | keiner | kein zweites Event |
| AB Audit event | Admin | neue gültige Approval | approved | ja, N→N+1 | gleich / gleich | keiner zusätzlich | sanitisiertes Event atomar |

## 37. Owner Decisions

| # | Entscheidung / Varianten | Empfehlung | Risiko | Status |
|---:|---|---|---|---|
| 1 | alle fünf Review vs auto | alle fünf Human Review im MVP | Durchsatz | **EMPFOHLEN, OWNER OFFEN** |
| 2 | Admin Apply ja/nein | ja, Capability | Fehlfreigabe | **EMPFOHLEN, OWNER OFFEN** |
| 3 | Reviewer Apply ja/nein | später ja nach expliziter Permission; 03-01 Admin-only | Rollenverwischung | **EMPFOHLEN, OWNER OFFEN** |
| 4 | AI self-approve | niemals | automatisierte Wahrheitseskalation | **SAFETY REQUIREMENT** |
| 5 | Customer/System | beide ausgeschlossen | interne Freigabe umgangen | **SAFETY REQUIREMENT** |
| 6 | eine vs getrennte Permissions | Review/Apply/Reject getrennt | Mapperaufwand | **EMPFOHLEN, OWNER OFFEN** |
| 7 | zweite Mutation vs State Transition | bestehende Transition zwingend | Contractanpassung | **ARCHITECTURE REQUIREMENT** |
| 8 | lose vs ID/Version/Fingerprint | exakte Bindung | Replay/Manipulation | **SAFETY REQUIREMENT** |
| 9 | CAS | zwingend | Concurrent overwrite | **SAFETY REQUIREMENT** |
| 10 | Duplicate: Zeile/no_change | no_change/already_applied | Evidenceaggregation offen | **EMPFOHLEN, OWNER OFFEN** |
| 11 | Reviewer Protection | strikt | manuelle Auflösung nötig | **SAFETY REQUIREMENT** |
| 12 | Admin korrigiert Reviewer still/Workflow | nur expliziter Correction-Workflow | operativer Aufwand | **EMPFOHLEN, OWNER OFFEN** |
| 13 | Rejection flüchtig/persistent | persistent erst mit Conversation-State-Repository | Schema später | **EMPFOHLEN, OWNER OFFEN** |
| 14 | Observation Correction gekoppelt/separat | separat | mehr Workflows | **SAFETY REQUIREMENT** |
| 15 | Audit Logging | für realen Review/Apply notwendig | PII in Metadata | **SAFETY REQUIREMENT** |
| 16 | Persistenter Apply | atomarer Repositoryschritt/DB-Transaktion später | Architektur offen | **EMPFOHLEN, OWNER OFFEN** |
| 17 | Readiness effect | `none` | Collectionnutzen separat | **IMPLEMENTED IN CONTRACT** |
| 18 | Technical Missing | unverändert | keine technische Progression | **SAFETY REQUIREMENT** |
| 19 | Planner Evidence Context | später nur Deduplizierung/Route | versehentliche Need-Erfüllung | **EMPFOHLEN, OWNER OFFEN** |
| 20 | Auto-Apply | später selektiv nach Metrics/Ownergate | Bias/fehlende Ground Truth | **NOT APPROVED** |
| 21 | Metrics | approval/rejection/correction/site contradiction, property/actor/rule | falsche „Accuracy“ | **PLANNED, NOT IMPLEMENTED** |
| 22 | offene Proposals vs Löschung | blockieren relevante Medienlöschung | Retentionkonflikt | **EMPFOHLEN, OWNER OFFEN** |
| 23 | Claim nach Tombstone | darf schwach bestehen; Provenienz unavailable | Re-review eingeschränkt | **EMPFOHLEN, OWNER OFFEN** |
| 24 | nächstes Paket | 03-01 Simulator/Admin/pure approve-reject | Contractlücken | **EMPFOHLEN, OWNER OFFEN** |

## 38. Recommended Packages

1. **AP-15-04-01-12-03-01 Synthetic Human Review and Descriptive Claim Apply:** Simulator-only, Admin-only, pure State Transition, exakt fünf Properties, approve/reject, keine Persistenz/realen Medien/Vision, Readiness unverändert. Dabei Review-Builder und answer-spezifische Transition-Felder sauber lösen.
2. **AP-15-04-01-12-03-02 Review Regression and Planner Evidence Context:** Permissions/Regression und ausschließlich registrierte Collection-Deduplizierung; keine Technical Progression.
3. **Evidence ↔ Project Media Binding Audit.**
4. **Customer Media Retention Audit.**
5. **Persistent Conversation Intelligence Audit** einschließlich atomarem Review/State/Audit-Repository.
6. **Vision Adapter Audit.**

## 39. Future Test Strategy

Später testen: zentrale Permissions und Actor Restrictions; strict geschlossene Review-/Apply-Schemas; unbekannte Felder; exakte Proposal-ID/Version/Fingerprint-/Project-/Conversation-Bindung; serverseitiger Actor; CAS; `N→N+1`/`N→N`; apply/no_change/duplicate/two-tab/race/replay; Konflikt und Reviewer Protection; Reject ohne Mutation; getrennte Corrections; exakt fünf Properties; `true`/`descriptive_fact`/`observed` unveränderlich; Readiness/Missing unverändert; Planner nur Evidence Context; Simulatoraktionen/-warnungen; genau ein sanitisiertes Audit Event; Input-/State-Immutability; keine Persistenz im synthetischen Paket; keine freien Claims/URLs/PII.

## 40. Production Gates

Vor Produktion: Ownerfreigabe der offenen Entscheidungen; qualifikations-/rollenbasierte zentrale Capabilities; persistenter versionierter Proposal-/Reviewstatus; atomarer CAS-Repository-/DB-Schritt; sanitisiertes Audit-Schema; Project-Media-/Evidence-Binding und Autorisierung; Retention/Tombstone-/Open-Review-Policy; Correction-/Conflict-Workflow; Planner-Trennung; Quality-Baseline; Security/Privacy Review; fokussierte Tests, Typecheck, Lint und Production Validation. Dieses Audit schaltet kein Gate frei.

## 41. Scope Confirmation

Ausdrücklich bestätigt: ausschließlich Audit; kein Claim Apply; keine Knowledge-State-Mutation; keine Readiness- oder Missing-Änderung; keine UI/Simulatoränderung; keine Persistenz/DB/Migration/SQL/RPC/RLS/Supabase-/Storageänderung; keine Project-Media-Bindung; keine Vision/KI; kein WhatsApp; keine Knowledge Base; keine Metrics; keine Tests; keine `package.json`-Änderung. Exakt eine neue Auditdatei ist Gegenstand dieses Pakets.

## 42. Status

**Auditstatus: READY FOR OWNER DECISION**

**DESCRIPTIVE KNOWLEDGE CONTRACTS — IMPLEMENTED**

**OBSERVATION TO DESCRIPTIVE CLAIM PROPOSALS — IMPLEMENTED**

**HUMAN-CONTROLLED DESCRIPTIVE CLAIM APPLY — NOT IMPLEMENTED**

**DESCRIPTIVE CLAIM REVIEW WORKFLOW — NOT IMPLEMENTED**

**DESCRIPTIVE CLAIM AUTO-APPLY — NOT APPROVED**

**DESCRIPTIVE FACT TECHNICAL READINESS EFFECT — NONE**

**PERSISTENT REVIEW/AUDIT TRAIL — NOT IMPLEMENTED**

**CUSTOMER PHOTO PROJECT BINDING — NOT IMPLEMENTED**

**CUSTOMER PHOTO RETENTION POLICY — NOT FINALIZED**

**VISION — NOT IMPLEMENTED**

**WHATSAPP — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**

## AP-15-04-01-12-03-01 Synthetic Human Review and Descriptive Claim Apply Result

### Review Contract und Review State

Der implementierte strict/readonly Review-Command bindet Projekt, Conversation, opaque Proposal-ID, erwartete Knowledge-Version, die geschlossene Action `approve | reject | mark_evidence_insufficient`, ausschließlich `admin`, eine injizierte synthetische Actor-UUID und einen Offset-Timestamp. Extra Fields, freie Actions, echte Userdaten und freie Fehlertexte werden nicht akzeptiert. Der lokale immutable `DescriptiveClaimReviewState` enthält nur Projekt-/Conversation-Bindung, Revision und sanitisierten Entry aus Proposal-Fingerprint, Property, Entscheidung, Actor Class/ID, Timestamp und geschlossenem Resultcode. Eine neue fachliche Entscheidung erhöht die Revision genau einmal; Replay erzeugt keine Fake-Revision.

### Admin-only und Client Boundary

Der Simulator injiziert eine konstante synthetische Admin-ID und lädt weder Auth- noch Supabase-Daten. Die UI übergibt nur Proposal-Referenz, Expected Version und Action. Der Domainadapter sucht das Proposal im injizierten lokalen Proposal-Repository und rekonstruiert/validiert Property, Boolean-Wert, Strength, Epistemik, Evidence, Entity, Projekt und Conversation. AI darf Proposal-Ursprung sein, kann aber nicht reviewen oder sich selbst freigeben. Reviewer-/Customer-Review ist in diesem Paket nicht freigeschaltet.

### State Transition Reuse, CAS und Knowledge Mutation

Approval erzeugt rein `KnowledgeClaimProposal → Human Review → StateTransitionProposal(transition_origin=descriptive_claim_review) → applyStateTransitionProposal(...)`. Es gibt keine neue Claim-Mutationsfunktion. Die allgemeine Transition besitzt hierfür einen nicht answer-spezifischen Origin und `descriptive_transition`; Dummy-Answer-/Retry-Felder werden nicht erzeugt. Echte Änderung ist exakt `N→N+1`; stale Expected-/Proposal-Version ergibt `stale_state` ohne Apply oder Rebase.

### Proposal Validation, Idempotency, Duplicates und Konflikte

Die Konvertierungsgrenze erlaubt exakt die fünf auditierten descriptive Properties und unverändert nur Boolean `true`, `descriptive_fact`, `observed`, aktive Evidence, gültige Entity-/Projekt-/Conversation-Bindung sowie Proposal-Version/Fingerprint. Gleicher Proposal-Fingerprint plus gleiche Action ist Replay; erfolgreiches Approval liefert `already_applied`, ohne Claim, State-Version oder Review-Revision zu duplizieren. Ein äquivalenter aktiver Claim ergibt `no_change`. Abweichende effektive Claims ergeben defensiv `conflict_detected`; es entsteht weder Supersession noch automatischer Retry. Reviewer-/manual-corrected Claims werden nicht überschrieben; im gültigen descriptive Contract ist ein äquivalenter Reviewer-Claim ein idempotentes `no_change`.

### Reject und Evidence Insufficient

`reject` und `mark_evidence_insufficient` schreiben genau einen lokalen Review Entry, ändern aber weder Knowledge State, Observation noch Evidence. Ablehnung erklärt die Observation nicht für falsch. Insufficient startet keine Fotoanforderung und lässt einen späteren besseren Evidence-Pfad offen.

### Strength, Epistemik, Readiness und Missing Information

Apply schreibt Strength und Epistemik nicht um: ausschließlich `descriptive_fact` und `observed` passieren die Grenze. Es gibt kein `confirmed` und keine stärkere Strength. Die vorhandene Property Registry trägt `technical_readiness_effect=none`; Tests vergleichen Readiness und Technical Missing Information vor/nach Apply strukturell auf exakte Gleichheit. Insbesondere erfüllt `outdoor_installation_area_observed=true` niemals `outdoor_unit_position_known` oder eine andere technische Property. Planner/Information Gain wurden nicht produktiv verändert.

### Simulator UX, Pending Guard und History

Die Reviewkarte zeigt Propertylabel, „Kontext wurde beobachtet“, „Deskriptiver Fakt“, den Übernahmestatus und prominent „Keine technische Freigabe.“ Exakt die Aktionen „Übernehmen“, „Ablehnen“ und „Evidence nicht ausreichend“ sind vorhanden. Ein synchroner Ref-Guard verhindert Doppelsubmit; während der Aktion sind Controls disabled/`aria-disabled`, die Karte ist `aria-busy`, und „Wird übernommen …“ wird angezeigt. Erfolgs-, Reject-, Insufficient-, Conflict- und Stale-Texte sind kontrolliert. Der Knowledge Inspector kennzeichnet descriptive Claims getrennt als „Deskriptiver Fakt“ und „Beobachtet“. Die History zeigt Property, Decision, Result, Actor Class und Timestamp; IDs nur im Debugmodus. Die Pipeline zeigt Human Review, State Transition/Apply und „Technical Readiness: unverändert“.

### Replay, Tests und Remaining Limits

Die Simulator-Input-Union kennt nun zusätzlich die geschlossenen Arten `evidence_observation` und `claim_review`; Review-Ausführung und injizierte IDs/Timestamps sind pure und deterministisch. Fokussierte Vitest-Tests decken strict Schema, Actions/Actor/UUID/Timestamp, Immutability/Revision, alle fünf Approvals, Reject, Insufficient, CAS, Replay, Duplicate, Reviewer-Schutz, Strength, Epistemik, Readiness, Missing Information und UI-Sicherheitsgrenzen ab. Es gibt keine Persistenz, DB, Migration, Supabase-/Storage-/Server-Action-, echte Medien-, Vision-/AI-API-, WhatsApp- oder Auto-Apply-Kopplung. Ein persistenter atomarer Reviewworkflow, Reviewer-Capability, echte Project-Media-Bindung und Correction/Supersession bleiben getrennte Folgepakete.

**SYNTHETIC HUMAN DESCRIPTIVE CLAIM REVIEW — IMPLEMENTED**

**ADMIN-ONLY SYNTHETIC REVIEW — IMPLEMENTED**

**DESCRIPTIVE CLAIM APPLY VIA EXISTING STATE TRANSITION — IMPLEMENTED**

**DESCRIPTIVE CLAIM REJECT — IMPLEMENTED**

**EVIDENCE INSUFFICIENT REVIEW RESULT — IMPLEMENTED**

**DESCRIPTIVE APPLY CAS / IDEMPOTENCY — IMPLEMENTED**

**TECHNICAL READINESS EFFECT — NONE**

**TECHNICAL MISSING INFORMATION EFFECT — NONE**

**PERSISTENT REVIEW WORKFLOW — NOT IMPLEMENTED**

**REVIEWER ROLE REVIEW WORKFLOW — NOT IMPLEMENTED**

**AUTO-APPLY — NOT IMPLEMENTED**

**REAL PROJECT MEDIA BINDING — NOT IMPLEMENTED**

**VISION — NOT IMPLEMENTED**

**WHATSAPP — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**
