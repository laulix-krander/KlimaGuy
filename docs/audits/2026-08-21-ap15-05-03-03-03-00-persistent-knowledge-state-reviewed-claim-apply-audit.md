# AP-15-05-03-03-03-00 — Persistent Knowledge State and Reviewed Claim Apply Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-21-AP15-05-03-03-03-00-PERSISTENT-KNOWLEDGE-STATE-REVIEWED-CLAIM-APPLY-V1` |
| Datum | 2026-08-21 |
| Branch | `codex/audit-ap15-05-03-03-03-persistent-knowledge-apply` |
| Baseline | `3d8df15b86ae5028a53c24a2a6027dadf9f04f11` (`work`) |
| Paket | AP-15-05-03-03-03-00, ausschließlich Audit/Architektur |
| Ergebnis | **READY FOR OWNER DECISION** |

Vollständig zugrunde gelegt wurden das verbindliche Dependency-Audit einschließlich der Resultabschnitte AP-15-05-03-03-01/-02, die Audits zu Conversation Intelligence, Answer Interpretation, State Transition/Conversation Cycle, Descriptive Knowledge, Synthetic Human Review/Apply und Planner Evidence Context sowie die zugehörige pure Domain, persistente Proposal-/Review-Implementierung und aktuelle Migration-/RLS-/RPC-Muster. Repository-Wahrheit, Empfehlung und noch offene Ownerentscheidungen werden getrennt.

## 2. Scope

Dieses Audit entscheidet ausschließlich, wie die bestehende pure Knowledge-State-/Transition-Engine als persistente Autorität materialisiert und ein `approved_apply_pending` Proposal transaktional, idempotent und CAS-gesichert angewendet werden kann. Es implementiert nichts: keine Migration, SQL/RPC/RLS, Persistenz, Apply, Correction, Proposal-/Review-/Delete-/Offer-/Planner-/Readiness-Änderung, UI, WhatsApp, Vision, AI oder Tests.

## 3. Current Persistent Intelligence Pipeline

Die produktive Kette ist heute:

`project_media → project_evidence → evidence_interpretation_runs → evidence_observations → evidence_claim_proposals → evidence_claim_reviews`.

Interpretation Runs und typed Observations sind persistent. Proposal-Erzeugung nimmt clientseitig nur `observation_id`, nutzt serverseitig `proposeKnowledgeClaimFromObservation(...)` und persistiert ausschließlich fünf positive descriptive Properties als `boolean=true`, `value_type=boolean`, `epistemic_status=observed`, `knowledge_strength=descriptive_fact`, Mapping Rule Version 1. Reviews sind append-only, Admin-only, Proposal-revisionsgebunden und trennen Workflowstatus von Result. `approve` endet absichtlich bei `approved_apply_pending`; weder Claim noch Knowledge State existieren produktiv. Pending Review und Apply Pending bleiben offene Media Dependencies; Evidence-bound Delete bleibt darüber hinaus pauschal fail-closed.

## 4. Current Pure Knowledge Architecture

### Aggregate und Claim

`KnowledgeState` ist ein strikt validiertes immutable Domainobjekt aus `project_id`, **pflichtiger** `conversation_id`, positiver `state_version`, readonly `claims` und `updated_at`. Das Schema erzwingt projektgleiche Claims und eindeutige Claim-IDs, aber bindet einzelne Claims nicht selbst an Conversation; die Conversation-Bindung liegt am Aggregate/Transition-Kontext.

`KnowledgeClaim` enthält:

- UUID `claim_id`, `project_id`, `entity_type` (`project|room|installation`) und Entity-UUID;
- geschlossenen `property_key`, dessen Entity- und Value-Type-Zuordnung geprüft wird;
- discriminated Value: nichtleerer String, positive finite Number (für Zählwerte integer), Boolean oder `null` mit `value_type=unknown`;
- Epistemik `confirmed|reported|observed|estimated|assumed|unknown|not_applicable|contradicted|requires_site_check`;
- mindestens eine Evidence Reference, `created_at`, positive Claim-`state_version`, optional `supersedes_claim_id` und optional `knowledge_strength`;
- Strength `observed|descriptive_fact|technical_hypothesis|technical_assessment|reviewer_approved|site_verified`. Sie ist für descriptive Properties Pflicht, für kompatible Legacy-/Technical Claims optional. Es gibt keine zulässige Default-Eskalation.

Eine Evidence Reference trägt UUID `evidence_id`, geschlossenen Source Type (`customer_message|internal_note|project_media|manual_entry|system_rule|ai_analysis|reviewer_correction`), opaque UUID `source_id`, Actor Class (`customer|admin|reviewer|system|ai`), `observed_at` und Status (`active|superseded|invalidated|manually_confirmed|manually_corrected`).

### Version, Effective State, Supersession und Contradiction

Fixtures und alle State-Schemas starten bei **Version 1**, auch der leere State. `addClaim` akzeptiert nur Claimversion `N+1`, hängt immutable an und erhöht den Aggregate State genau einmal. `supersedeClaim` verlangt existierenden Vorgänger, identische Entity/Property und exakten `supersedes_claim_id`; History bleibt erhalten.

`getEffectiveClaims` entfernt (1) jeden Claim, dessen ID von irgendeinem Claim referenziert wird, und (2) Claims ohne wenigstens eine Evidence, deren Status weder `superseded` noch `invalidated` ist. `getEffectiveClaim` nimmt für Entity/Property den effektiven Claim mit höchster Claim-State-Version. `findContradictions` gruppiert effektive Claims nach Entity/Property, ignoriert `unknown` und `not_applicable` und diagnostiziert unterschiedliche serialisierte Werte oder Status `contradicted`; numerische Konflikte erhalten einen eigenen Code. Parallele Claims bleiben Wahrheit, Diagnostics sind Ableitung.

Reviewer-/Manual-Correction-Protection greift bei Supersession, wenn Evidence des Vorgängers Actor `reviewer` oder Status `manually_corrected` trägt. Sie schützt nicht durch einen losen Rollenflag, sondern durch persistierbare Provenienz.

### Proposal, ApplyContext, Idempotenz und Apply

`StateTransitionProposal` bindet UUIDs für Transition/Interpretation, Idempotency Key, Project und Conversation, `based_on_state_version`, `proposed_state_version`, Origin/Information Key, Evidence- und Claim-Proposals, Superseded IDs, Erklärung, Timestamp, semantischen Resulttyp sowie einen geschlossenen Transition Type. Claim-Proposals tragen Claimwert, Evidence, beide Versionen und optionale Strength/Supersession/Approximation.

`StateTransitionApplyContext` verlangt Project, Conversation, aktuellen State, Proposal, `applied_at`, `apply_id` und optional `not_applied|already_applied`. Die Engine prüft Project-/Conversation-Bindung, Versionsbindung, Claim-/Evidence-ID-Konflikte, Gleichheit der aggregierten Claim-Evidence mit `evidence_proposals`, Transition-spezifische Semantik, Supersession und Reviewer Protection.

- `already_applied` liefert immutable `transition_already_applied`, keine IDs und keine Versionserhöhung.
- No-change-Transitionen liefern `transition_no_change`; State bleibt exakt N.
- Eine Transition mit einem oder mehreren Claim-Proposals erhöht den State **genau einmal von N auf N+1**, nicht einmal pro Claim.
- Contradiction Apply ist nur gültig, wenn `findContradictions` nach Apply tatsächlich einen neuen Claim der Transition diagnostiziert.
- Erfolg liefert `transition_applied`; Fehler tragen exakt `retryable`, `requires_replanning` und `requires_human_review`.

Die pure Engine mutiert nie den Input. Conversation Cycle nutzt Interpretation → Apply → Missing/Readiness/Assessment/Planner in memory. Synthetic Review rekonstruiert eine descriptive Transition und wendet sie sofort pure an; die produktive Review-Baseline tut dies bewusst nicht.

## 5. Persistence Problem

Ein serialisierter State-Blob allein kann CAS, gezielte Querys, referentielle Evidence-Integrität und Append-only-History schlecht verbinden. Nur Claims ohne Application Record können dagegen Timeout-Replay und atomare Proposalterminalisierung nicht beweisen. Eine DB-Neuimplementierung aller Domainregeln würde zwei Claim Engines schaffen. Erforderlich ist daher eine relationale Authority, die den von der pure Engine berechneten Delta-Plan unter einem DB-seitigen CAS atomar **validiert und persistiert**, ohne fachliche Regeln neu zu entscheiden.

## 6. Architecture Variants

Bewertung: `++` stark, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet. MVP bewertet geringe Komplexität positiv.

| Kriterium | A Snapshots | B Claims + Version | C Header + Claims + Log | D Event sourced | E Hybrid |
|---|---:|---:|---:|---:|---:|
| Domainpassung/immutable State | + | + | ++ | + | ++ |
| CAS | + | + | ++ | + | ++ |
| Idempotenz/Timeout-Replay | 0 | - | ++ | ++ | ++ |
| Supersession/History | 0 | ++ | ++ | ++ | ++ |
| Contradiction/Reviewer Protection | -/0 | + | ++ | + | ++ |
| Querybarkeit/effective Claims | - | ++ | ++ | -/0 | ++ |
| Audit/Replay | + | 0 | ++ | ++ | ++ |
| Correction-Erweiterung | 0 | + | ++ | ++ | ++ |
| WhatsApp/Vision/Provenienz | - | + | ++ | ++ | ++ |
| Delete Dependencies | - | 0 | ++ | 0 | ++ |
| Migration bestehender Projekte | 0 | + | ++ | - | ++ |
| MVP-Komplexität | 0 | ++ | + | -- | + |

- **A:** Vollsnapshot pro Version erleichtert historische Reconstruction, dupliziert aber Claims/Evidence, erschwert FKs und erzeugt große Write-Amplification.
- **B:** Append-only Claims plus Version ist klein, besitzt aber keinen eindeutigen Application-/Idempotency-Beweis und trennt Transitionresultat nicht von Audit.
- **C:** Solide relationale Baseline; entspricht faktisch E ohne die explizite deterministische Read-/optionale Snapshot-Strategie.
- **D:** Event-Rebuild und Projection-Betrieb sind für den modularen Monolithen unnötig komplex; aktuelle Conversation Events sind keine produktive Event Authority.
- **E:** Header + append-only Claims + relationale Evidence + Application Records; Current State wird deterministisch gelesen, optionaler Snapshot darf später nur Cache sein.

## 7. Recommendation

Eindeutige Empfehlung ist **Variante E**. Pro Projekt existiert ein State Header; Claims und Claim-Evidence sind append-only; Transition Applications bilden CAS-/Idempotency-/Resultautorität. Ein schmaler Read-Adapter rekonstruiert das bestehende `KnowledgeState` und lässt die bestehende Engine entscheiden. Ein atomarer Persistence-Command akzeptiert ausschließlich einen serverseitig erzeugten, vollständig typisierten Delta-Plan und prüft CAS/Identitäten/Constraints. Snapshots sind nicht MVP-Scope und wären später nur rebuildbarer Cache.

## 8. Knowledge Authority Scope

Empfehlung: **Knowledge Authority ist project-scoped**, nicht WhatsApp-Session-scoped. Projektwissen (Raum, Installation, Angebotseingaben) muss Conversation Sessions überleben und darf bei mehreren künftigen WhatsApp Sessions nicht fragmentieren. Das weicht bewusst von der heutigen synthetischen Aggregateform ab: Die Pflicht-`conversation_id` beschreibt aktuell den Ausführungskontext der pure Conversation Engine, nicht eine bewiesene produktive Authority.

Der persistente State Header hat genau eine aktive Identität pro `project_id`. Claims tragen optionale, FK-gesicherte Conversation-Provenienz erst, sobald eine echte Conversation Authority existiert. Apply darf bis dahin keine synthetische Conversation-UUID speichern oder ihr Autorität zuschreiben.

## 9. Conversation Boundary

| Variante | Bewertung |
|---|---|
| A Knowledge erst nach Conversation Persistence | korrekt, blockiert aber den vorhandenen reviewed Media-Pfad unnötig |
| B project-scoped v1, spätere Conversation-Provenienz | **empfohlen**; stabile fachliche Authority, additive Migration |
| C opaque `conversation_context_id` ohne Message Authority | abzulehnen; sieht autoritativ aus, ist aber nicht verifizierbar |
| D nullable `conversation_id` | als Claim-Provenienzspalte später/nullable sinnvoll, nicht als Header-Scope |

Für AP-...-01 wird aus der persistenten descriptiven Pipeline **kein** Conversation-Wert benötigt. Ein serverseitiger Adapter zur alten pure Engine muss einen explizit als transient markierten Apply-Kontext verwenden oder die pure Engine vor Persistenz um einen project-scoped Adaptercontract ergänzen; dieser Wert darf niemals persistiert werden. Vor Customer-Answer-/WhatsApp-Claims muss eine echte Conversation-/Message-Persistenz mit projektgleicher FK eingeführt werden. Danach erhalten Claims/Transitions nullable `source_conversation_id`, während der State weiter project-scoped bleibt.

## 10. State Header

Minimal geplant: `id` UUID PK, `project_id` UUID NOT NULL UNIQUE/FK, `current_version` positive bigint, `schema_version` positive integer, `created_at`, `updated_at`. **Kein** Claim, JSON-State oder fake `conversation_id` im Header. Ein zusammengesetzter Unique Key `(project_id,id)` unterstützt projektgleiche Child-FKs.

## 11. State Version

`current_version` ist fachliche CAS-Version. Initial ist **1**, weil das aktuelle `KnowledgeState`-Schema positive Werte verlangt und alle leeren Fixtures Version 1 verwenden. State-changing Apply setzt genau N→N+1 unabhängig von Claimanzahl. `no_change`/already-applied bleibt N. Version 0 würde bestehende Semantik erfinden und ist ausgeschlossen.

## 12. Schema Version

`schema_version` ist getrennt von `current_version`, startet als freigegebene Konstante 1 und ändert sich nur bei Semantik-/Serialization-Migration, nicht bei Claims. Mapping-/Knowledge Rule Version gehört an Proposal/Claim/Transition-Provenienz und erhöht niemals State- oder Schema-Version.

## 13. Knowledge Claim Persistence

Geplant ist eine typed append-only Tabelle mit `claim_id` UUID PK, `knowledge_state_id`, redundanter projektgleicher `project_id`, optional später FK-gesicherter `source_conversation_id`, `entity_type`, `entity_id`, `property_key`, typed Value-Spalten, `value_type`, `epistemic_status`, nullable `knowledge_strength`, nullable `supersedes_claim_id` mit projekt-/stategleicher self-FK, `claim_state_version`, `created_at`, `source_transition_id` und `mapping_rule_version`/Rule-Version wo vorhanden. Evidence liegt separat. Es gibt kein fachliches UPDATE/DELETE; Supersession/Correction erzeugt einen neuen Claim. DB-Constraints bilden nur geschlossene Typ-/Identitätsinvarianten ab, nicht die komplette Claim Engine.

## 14. Typed Values

| Variante | Ergebnis |
|---|---|
| separate `value_text/value_number/value_boolean` + discriminator | **empfohlen**: querybar, streng checkbar, verlustfrei |
| JSONB + Domain Gate | flexibel, aber DB-seitig schwächer und lädt zu freien Payloads ein |
| normalisierte Value-Subtabellen | streng, aber unnötige Joins/Komplexität im MVP |

Ein XOR/shape Check verlangt exakt die zum `value_type` passende Spalte. `string` bewahrt Text/Enum exakt, `number` Postgres numeric/double passend zur freigegebenen JS-finite Strategie, `boolean` true/false. `unknown` besitzt alle Values NULL und bewahrt **separat** `epistemic_status=unknown|not_applicable|requires_site_check`; so gehen diese drei Nullbedeutungen nicht verloren. Die aktuelle Domain kennt keinen Value Type `enum`, sondern kanonische Stringwerte. Kein `COALESCE`, kein Default und keine Konversion zu Text.

## 15. Strength

`knowledge_strength` bleibt nullable, damit bestehende technische/Legacy Claims ohne Strength verlustfrei bleiben. DB/Domain verlangt sie für descriptive Properties; der aktuelle Pfad akzeptiert ausschließlich `descriptive_fact`. Null darf nie beim Read zu `observed`, `technical_assessment` oder höher eskaliert werden. Spätere Backfills benötigen einen eigenen fachlichen Entscheid, keine Defaultmigration.

## 16. Evidence Provenance

`knowledge_claim_evidence` ist append-only und enthält eigene Evidence-Reference-ID, `claim_id`, `project_id`, geschlossenen `source_type`, typisierte Source-FK-Spalten, `actor_class`, `evidence_status`, `observed_at` sowie optional Rule-/Transition-Provenienz. Ein Claim hat mindestens eine Relation; mehrere sind erlaubt. Verboten sind Storage Bucket/Path, Signed URL, Provider URL/Payload, Message Text, Raw AI Output und PII.

## 17. Project Evidence Boundary

Für den jetzigen descriptive Pfad ist `source_type=project_media` fachlich eine Domainbezeichnung, die `source_id` der Observation zeigt aber auf persistentes `project_evidence`, nicht auf einen Locator. Persistence friert dies klarer als `source_type=project_evidence` oder als typed `project_evidence_id` plus Domain-Mapper ein; Empfehlung ist typed `project_evidence_id` mit zusammengesetzter `(project_id,id)` FK und ein Adapter, der die bestehende Domain Source-Semantik verlustfrei rekonstruiert. Keine direkte Claim→`project_media`-FK: Evidence ist Identity/Provenienz, Media ist austauschbarer/tombstonbarer Ursprung.

## 18. Domain Evidence Sources

| Variante | Bewertung |
|---|---|
| A nullable typed FK columns | **MVP-Empfehlung**; starke FKs, XOR Check, source-spezifisch erweiterbar |
| B source-spezifische Evidence-Tabellen | sehr streng, aber Tabellenexplosion |
| C opaque Source UUID + Check | unzureichend; kein Existenz-/Projectschutz |
| D zentrale Evidence-Source-Registry | langfristig prüfbar, jetzt neue Authority und Migrationsaufwand |

AP-...-01 implementiert nur die typed `project_evidence_id`-Alternative. Spätere `customer_message_id`, `reviewer_correction_id`, `system_rule_id` usw. werden additiv erst mit ihrer Authority ergänzt. `ai_analysis` benötigt einen autoritativen Run, nicht eine beliebige UUID. Ein Source-Type/typed-column XOR verhindert Generic-FK-Lücken. Ununterstützte Sources fail closed statt opaque gespeichert zu werden.

## 19. Transition Application

`knowledge_state_transitions` ist die persistente Application Authority: UUID `id`, State/Project, Proposal und Review, `expected_version`, `resulting_version`, geschlossener Transition Type/Origin, Workflowresultat (`applied|no_change`), Actor UUID/Class, `applied_at`, serverseitiger Idempotency Key/Digest und optional sanitized Failure Classification in einer getrennten Attempt-/Auditbetrachtung. Keine Raw Proposal-/Claim-Payload-Dumps. Applied Claim(s) referenzieren `source_transition_id`.

## 20. Idempotency

Empfohlene exakte Bindung ist ein serverseitiger kanonischer Digest über:

`apply:v1 + project_id + knowledge_state_id + proposal_id + proposal_revision + approval_review_id + expected_state_version`.

Proposal ID allein ist fachlich fast ausreichend, verliert aber Revision/Review-Bindung; ein clientgelieferter Key ist keine Authority. Unique sind `proposal_id` (nur eine erfolgreiche terminale Application) und der Digest. Replay prüft **vor** stale/terminal rejection unter Lock den existierenden Application Record und liefert dessen gespeichertes Resultat. Gleicher Key mit abweichender Bindung ist Conflict/fail closed. No-change besitzt ebenfalls genau einen Application Record, jedoch keine Claimzeile und keine neue Version.

## 21. CAS

Apply sperrt den State Header und verlangt `expected_state_version == current_version`. Der Expected-Wert stammt serverseitig aus dem persistierten Proposal/Application-Command, nicht aus einem Claimwert des Clients. Mismatch ist `stale_state`, mutiert nichts und erfordert Replan plus gegebenenfalls erneutes Human Review; **kein** Auto-Rebase und kein stiller Retry auf neuer Version.

## 22. Atomic Apply

Eine zentrale DB-Transaktion umfasst in definierter Lock-Reihenfolge:

1. Proposal locken; Projekt, Status `approved_apply_pending`, Revision prüfen.
2. Gebundene Approval Review locken/validieren.
3. State Header lazy anlegen oder locken; Expected Version prüfen.
4. Observation, Evidence, Interpretation, Media/Lifecycle/Tombstone und Projectstatus unter konsistenter Lockreihenfolge revalidieren.
5. Den serverseitig aus diesen Rows rekonstruierten Transitionplan/dessen Digest mit dem zuvor durch die pure Engine berechneten Delta verbinden.
6. Claim(s), Evidence Links und zulässige Supersession append-only schreiben.
7. Header nur bei Änderung N→N+1 setzen.
8. Proposal auf `applied` setzen und Revision erhöhen; Result `applied|no_change` im Application Record schreiben.
9. Sanitisiertes Audit Event schreiben.

Jeder Fehler rollt **alles** zurück. Insbesondere sind „Claim persisted, Proposal update failed“ und „Audit failed“ keine erreichbaren committed Zwischenzustände.

## 23. Pure Engine / Persistence Split

| Variante | Bewertung |
|---|---|
| A RPC implementiert Domainsemantik erneut | abzulehnen: zweite Claim Engine |
| B Service liest State, pure Engine entscheidet, RPC CAS-persistiert Delta | **empfohlen für Supabase-MVP** |
| C persistierter Proposal + Worker | unnötige Eventual Consistency; kein Background Retry im Scope |
| D echte serverseitige transactionale Repositorygrenze | ideal, falls Runtime/DB-Client eine Callback-Transaktion zuverlässig unterstützt; heutiges Supabase-Muster bietet eher RPC |

Empfehlung ist **B mit schmaler hybrid RPC-Grenze**: TypeScript lädt den autoritativen State, rekonstruiert Proposal, ruft unverändert `applyStateTransitionProposal(...)` auf und sendet nur IDs, Expected Version und deterministisch verifizierbare resultierende typed Rows an eine `SECURITY DEFINER` CAS-RPC. PL/pgSQL entscheidet keine Contradiction-/Strength-/Supersession-Regel neu; es erzwingt Locks, Auth, FKs, closed checks, exact Delta shape, Version und Atomarität. Vor Commit liest/lockt die RPC alle Authorities erneut. Paralleländerung führt CAS stale, nie zu Apply auf einem anderen State.

Retry-/Replan-Semantik: technischer Fehler vor Commit ist retryable mit demselben Key; CAS stale ist nicht blind retryable, sondern requires_replan. Nach Replan ist ein **neues**, erneut reviewtes Proposal nötig, sofern sich die fachliche Bindung änderte.

## 24. Proposal Reconstruction

Der Client sendet nur `proposal_id` und Expected Proposal Revision/State Version. Der Apply Service liest Proposal, neueste gebundene Approval Review, Observation, Interpretation/Evidence, Project/Entity und aktuellen State. Er rekonstruiert Claim-ID/Transition-ID serverseitig deterministisch oder als servergenerierte UUIDs, Property, `true`, Boolean, `observed`, `descriptive_fact`, Evidence und Mappingversion. Kein Client darf Value, Property, Strength, Epistemik, Evidence, Actor, Project oder Conversation vorgeben.

## 25. Approved Apply Pending

Nur die Konjunktion aus Proposalstatus `approved_apply_pending`, exakt gebundener unveränderter Approval Review, passender Proposalrevision und aktiver Authority darf Apply starten. Reject, insufficient, pending, conflict, stale, superseded oder beliebiger terminaler Zustand darf nie angewendet werden. `apply_pending` als Reviewresultat ist kein Ersatz für Approval.

## 26. Observation Validity

Apply prüft erneut: Observation `recorded`, Revision/ID entspricht Proposal, Interpretation/Evidence/Project stimmen, Evidence ist `bound`, Claimmapping bleibt für die persistierten typed Felder gültig, und keine Invalidation/Supersession ist eingetreten. Media/Lifecycle muss entsprechend Tombstonepolicy verifizierbar sein. Fehler ist fail closed `observation_invalidated|evidence_invalidated`, ohne Mutation.

## 27. Tombstone Race

Empfehlung/Ownerfreeze: **Reviewed-but-not-applied darf bei tombstoned, physisch abwesendem, deletion-pending oder logisch gelöschtem Original nicht angewendet werden.** Der gegenwärtige Review bescheinigt keinen dauerhaften Verzicht auf Originalverifikation; Correction Authority fehlt. Apply und Delete verwenden kompatible Media/Lifecycle Locks, sodass genau einer gewinnt. Nach bereits committed Apply bleibt der Claim samt locatorfreier Evidence-/Tombstone-Provenienz grundsätzlich erhalten, aber Delete bleibt wegen anderer unbekannter Authorities weiterhin gesperrt.

## 28. Duplicate Claim

Vor Transition Reconstruction werden effective Claims mit exakt Entity, Property, typed Value, Epistemik und Strength verglichen. Ein äquivalenter positiver descriptive Claim führt zu Applicationresultat `no_change`, Proposalworkflow `applied`, keiner Claim-/Evidence-Zeile und State N. Replay liefert denselben Record. Gleiches Property mit anderer Semantik ist kein Duplicate.

## 29. Contradiction

Nicht äquivalente effective Claims werden nicht automatisch superseded. Die bestehende pure `findContradictions`-Semantik bleibt maßgeblich. Für MVP wird die Diagnose on-read aus parallelen Claims abgeleitet; ein Applicationresultat kann sanitized `contradiction_recorded` auditieren, aber keine zweite Contradiction-Wahrheitstabelle einführen. Der aktuelle descriptive Reviewpfad endet bei Konflikt/human review und wendet ihn nicht automatisch an.

## 30. Supersession

Claims bleiben append-only. `supersedes_claim_id` bildet nur von der vorhandenen Engine bereits erlaubte Transitionen ab. AP-...-01 erzeugt für descriptive Observation Apply **keine** Supersession oder Correction. Unbekannte, Assumption- und explizite Customer-Correction-Fälle bleiben außerhalb; Schema/FKs dürfen ihre spätere Einführung nicht blockieren.

## 31. Reviewer Protection

Evidence Actor Class und Status werden verlustfrei relational gespeichert und vom Read-Adapter rekonstruiert. Jeder künftige Supersession-Apply lädt die Evidence des Vorgängers; Actor `reviewer` oder `manually_corrected` führt wie heute zu `reviewer_correction_protected`. Adminrolle umgeht dies nicht. Für Protection dürfen Evidencezeilen weder aktualisiert noch entfernt werden.

## 32. Positive-only Facts

Der aktuelle descriptive Pfad persistiert nur `boolean true + observed + descriptive_fact`. `false` ist verboten. Equivalent positive ist no-change. Ein echter Gegenbefund ist spätere Observation-/Evidence-Invalidation oder Correction, niemals ein künstlicher negativer descriptive Claim.

## 33. Proposal Terminal Semantics

Empfehlung: Workflow `approved_apply_pending → applied` sowohl bei Mutation als auch no-change. Das getrennte Applicationresultat ist `applied|no_change`. Ein eigener Proposalstatus `no_change` würde Workflow und Engineausgang vermischen. Applied-at und Application FK machen das Terminalresultat nachvollziehbar.

## 34. Failure Semantics

| Klasse | Beispiel | Retryklasse |
|---|---|---|
| `stale_state` | Header nicht Expected N | `requires_replan`; ggf. neues Review |
| `observation_invalidated` | nicht mehr recorded/revisionsgleich | human resolution/terminal für alten Proposal |
| `evidence_invalidated` | unbound/tombstoned/unavailable | human resolution; kein Apply |
| `review_invalid` | Approval fehlt/bindet andere Revision | human review |
| `conflict`/Reviewer Protection | nicht äquivalent/geschützt | human review/Correction |
| `persistence_failed` | transienter DB-Fehler, Rollback | retryable mit identischem Key |

Fehler setzen Proposal nie automatisch auf `rejected`. Fachlich stale/invalid kann in einem separaten kontrollierten Resolution-Command terminalisiert werden; technische Fehler lassen `approved_apply_pending` offen.

## 35. Retry

Kein Hintergrundretry in AP-...-01. Der Contract unterscheidet `retryable`, `requires_replan`, `requires_human_review` und `terminal`. Nur technische, sicher zurückgerollte Fehler sind direkt retryable. Stale verlangt Replan, Conflict/Protection Review/Correction, invalide Provenienz fail closed. Ein Retry verwendet denselben Idempotency Digest.

## 36. Current State Read

Ein server-only project-scoped Read Service lädt Header, effective Claims und deren Evidence in mengenbasierten Queries. History ist opt-in/paginiert. Der Adapter rekonstruiert und Zod-validiert `KnowledgeState`; bis Conversation Persistence nutzt er einen expliziten transienten Conversation Context nur beim Aufruf alter pure Funktionen, nie im Storage oder DTO. Normale UI liest nicht die gesamte Historie.

## 37. Effective Claims

Semantische Referenz bleibt `getEffectiveClaims`. MVP-Empfehlung: DB lädt nicht-superseded Kandidaten/Evidence effizient, TypeScript rekonstruiert und führt abschließend exakt die pure Funktion aus. Eine DB View darf später Queryoptimierung sein, aber nicht durch abweichende „latest wins“-Logik Autorität werden. Regressionen vergleichen Persistenzadapter und pure Ergebnis.

## 38. Historical Claims

Superseded/invalidated Claims und Evidence bleiben erhalten, ohne hard delete. History Read ist separat, project-scoped und paginiert; Stateversion/Source Transition/Supersession Chain bleiben sichtbar. RLS und Grants gelten identisch streng.

## 39. Contradiction Read

MVP: on-read `findContradictions` über den rekonstruierten effective State. Keine persistierte Diagnostic-Wahrheit. Falls Performance später eine Projection verlangt, muss sie vollständig rebuildbar und gegen pure Semantik getestet sein.

## 40. Readiness Boundary

AP-...-01 führt keine persistente Readiness-Projection ein und ändert keine Rules. Der descriptive Claim ist in bestehenden technischen Readinessregeln nicht als technische Freigabe zu behandeln; Regression muss beweisen, dass Readiness vor/nach diesem Apply unverändert ist.

## 41. Missing Information Boundary

Kein persistentes Missing-Information-System. Ein descriptive Context Fact löst kein technisches Missing und eskaliert keine Annahme, Site Check oder Offerfähigkeit. Bestehende pure Missing-Ausgabe muss unverändert bleiben.

## 42. Planner Evidence Context

Ja: AP-...-01 soll als pure Read-/Adapter-Regression testen, dass ein persistierter descriptive Claim nach Reconstruction von `derivePlannerEvidenceContext(...)` erkannt wird. Keine Plannerregistry/-regel ändern. Damit wird Persistenzverlust entdeckt, ohne Planner zu einer neuen Authority zu machen.

## 43. Delete Dependency

`approved_apply_pending` bleibt offen. Nach atomarem `applied` schließt **nur** Proposal-/Apply-Dependency; no-change schließt sie ebenfalls nachvollziehbar. Correction-, Offer-/Execution- und Projection-Vollständigkeit bleiben unknown. Das pauschale Evidence-bound Delete Gate bleibt unverändert fail-closed; AP-...-01 führt keine `project_media_dependencies`-Projection oder Deletefreigabe ein.

## 44. Correction Boundary

Keine Correction im Folge-Baseline-Paket. Append-only Claims, self-Supersession FK, Evidence Actor/Status und Transition-Provenienz müssen aber später `correction opened`, korrigierten Claim, Supersession und Reviewer Protection ermöglichen. Correction Authority ist Voraussetzung für eine belastbare Dependency Projection, weil offene Korrekturen sonst unsichtbar wären.

## 45. WhatsApp / Conversation Implication

WhatsApp kann künftig mehrere Sessions/Threads pro Projekt erzeugen. Sie sind Provenienz, nicht getrennte Knowledge Authorities. Vor WhatsApp-Claims müssen Message und Conversation persistent, idempotent und projektgleich sein. Danach verweisen Claim-Evidence/Transition optional darauf. Der project-scoped State verhindert Wissensinseln je Session; Zugriff und Replay dürfen dennoch Conversation-/Message-Bindung prüfen.

## 46. RLS

State, Claims, Claim Evidence und Transition Applications erhalten RLS. Im aktuellen MVP ist Read nur für aktive Admins mit Projectzugriff zulässig; Reviewer Read erst nach eigener Capability-/Ownerentscheidung, nicht implizit aus einem Namen. Keine Customerrechte. Soft-deleted Project bleibt entsprechend bestehenden Policies verborgen; Apply prüft aktives Project explizit.

## 47. Grants

Authenticated erhält höchstens kontrolliertes SELECT. Kein direkter INSERT/UPDATE/DELETE auf Header, Claims, Evidence oder Applications; keine Sequence-/Broad Grants. Claims/Evidence/Application Records sind append-only, Headermutation nur in Apply-RPC. Normaler DELETE ist verboten. Append-only Trigger schützt auch privilegierte normale DML-Pfade soweit mit bestehenden Mustern vereinbar.

## 48. Apply Security Boundary

Empfohlen ist Hybrid: serverseitiger TypeScript Service plus kleine `SECURITY DEFINER` CAS-RPC. RPC hat fixed `search_path`, prüft `auth.uid()`, ermittelt Actor/Role intern, verlangt aktuelle Admin-Capability und lädt alle Projectbindungen selbst. Service Role ist nicht nötig. Die RPC akzeptiert keine Actor-ID, Rolle oder Claim-Value-Authority vom Client und enthält keine vollständige Domainlogikduplikation.

Eine normale RLS-Transaktion wäre nur vorzuziehen, wenn der verwendete Serverclient nachweislich eine einzelne interaktive Postgres-Transaktion über pure Compute halten kann. Das aktuelle Repositorymuster spricht für die kurze RPC-Commitgrenze.

## 49. Audit Logging

Spätere sanitized Actions: `knowledge_state_initialized`, `knowledge_claim_applied`, `knowledge_claim_no_change`, `knowledge_claim_superseded`, `knowledge_contradiction_recorded`, `reviewed_claim_apply_failed`. Metadata enthält opaque Actor/Project/State/Proposal/Review/Transition/Claim IDs, Versionen, Result-/Reasoncode und Timestamp. Keine Raw Values standardmäßig: Property und insbesondere Wert können fachliche/personenbeziehbare Projektdaten sein. Falls Property für Betrieb zwingend wird, nur geschlossene Property Keys nach Privacy-Freeze; niemals Textvalue, Message, URL, Locator oder PII. Audit-Insert ist Teil der Erfolgstransaktion.

## 50. Transition Record vs Audit

Transition Application Record ist fachliche State-/Idempotency-Authority und wird für Replay gelesen. Audit Log ist sanitisiertes Operationsjournal und darf nicht Applyresultat rekonstruieren. Beide sind getrennt; Auditverlust darf nicht durch „best effort“ zu unprotokolliertem Claim führen, sondern rollt die Apply-Transaktion zurück.

## 51. Failure Matrix

Legende Retry: `ja` direkt, `replan`, `review`, `nein`; Version bezeichnet committed Headerversion.

| Fall | Erwartetes Ergebnis | Mutation? | Version | Retry/Replan/Review |
|---|---|---:|---|---|
| A approved, kein State | lazy Header V1 + Apply → Claim | atomar ja | 2 | nein |
| B State N | Engine/CAS Apply | atomar ja | N+1 | nein |
| C gleicher Apply doppelt | bestehendes Result zurück | nein | unverändert | idempotenter Replay |
| D zwei verschiedene concurrent Applies | einer gewinnt, anderer stale | nur Gewinner | N+1 | Verlierer replan/review |
| E Observation nach Review invalidiert | `observation_invalidated` | nein | N | review/resolution |
| F Evidence invalidiert/unbound | `evidence_invalidated` | nein | N | review/resolution |
| G Media deletion pending/absent/tombstoned | fail closed unavailable | nein | N | nach Authorityänderung review |
| H äquivalenter Claim vorhanden | Proposal `applied`, Result no-change | Application/Proposal/Audit | N | nein |
| I nicht äquivalenter Claim | conflict, kein Auto-Apply | nein | N | human review/Correction |
| J reviewer-protected Claim | protected | nein | N | Correction/reviewer |
| K CAS stale | `stale_state` | nein | N | replan, ggf. Review |
| L DB-Fehler beim Claim Insert | Gesamtrollback | nein | N | ja, gleicher Key |
| M Claiminsert, Proposalupdate würde fehlschlagen | Gesamtrollback | nein | N | ja/Fehler beheben |
| N Auditinsert fehlschlägt | Gesamtrollback | nein | N | ja |
| O Replay nach Timeout | Application gefunden, identisches Result | nein | committed N/N+1 | sicherer Replay |
| P Conversation-Provenienz mismatch | fail closed; heute keine persistierte Conversation | nein | N | replan/fix Authority |
| Q Project mismatch | DB-/Service rejection | nein | N | nein/security |
| R Proposal schon terminal | bestehendes Apply replayt oder not-applicable | nein | unverändert | nein; nur matching Replay |

Zu A: Headerinitialisierung V1 und Claim Apply V2 müssen in derselben Transaktion liegen; schlägt Apply fehl, existiert auch kein leerer Phantomheader. Zu H: Mutation meint nur Workflow/Application/Audit, nicht Knowledge State/Claim.

## 52. Race Conditions

| Race | Kontrolle/Ergebnis |
|---|---|
| zwei approved Proposals auf N | Header lock + CAS; einer N+1, einer stale |
| gleiches Proposal, zwei Tabs | Proposal lock + unique Idempotency/Application; ein Result |
| Review vs Apply | Apply verlangt committed Approval und lockt Proposal/Review |
| Observation Invalidation vs Apply | gleiche Observation/Evidence Locks; Gewinner bestimmt, Apply revalidiert |
| Correction vs Apply | State Header/Claim Lock + CAS; späteres Paket, nie silent overwrite |
| Delete vs Apply | gemeinsame Project/Evidence/Media/Lifecycle-Lockordnung; tombstone fail closed |
| Project closure/reopen vs Apply | Project lock/active-policy revalidation; kein ungeprüfter Statuswechsel |
| Reviewer Correction vs Admin Apply | Header/Claim CAS plus persisted reviewer evidence protection |

Lockordnung muss repositoryweit gefroren werden, bevorzugt Project → Media/Lifecycle → Evidence → Observation → Proposal/Review → State Header/Claims; wenn State-CAS früher benötigt wird, alle beteiligten RPCs müssen dieselbe dokumentierte Ordnung nutzen. Keine Cross-RPC-Lücke darf Delete Claim und Apply gleichzeitig passieren lassen.

## 53. Timeout Recovery

Wenn Commit erfolgreich war und der Client timeoutet, sucht Replay zuerst unter Proposal/Digest den Application Record. Er liefert `applied` oder `no_change` samt resulting Version und Claim IDs zurück. Er rekonstruiert keinen neuen Claim, erhöht keine Version und schreibt kein zweites Apply-Audit. Fehlt der Record wegen Rollback, darf derselbe Request normal erneut laufen.

## 54. State Initialization

| Variante | Bewertung |
|---|---|
| bei Project Creation | viele ungenutzte Header, koppelt bestehende Workflows |
| lazy beim ersten State Apply | **empfohlen**; klein und atomar |
| beim Conversation Start | falscher Scope/Conversation fehlt |
| Backfill aller Projekte | keine fachliche Notwendigkeit |

Lazy Init geschieht in der Applytransaktion unter Project-/Unique Lock mit Version 1, Schema 1; die erste Claimtransition basiert auf 1 und resultiert 2. Alternativ kann ein expliziter State-Read einen transienten leeren Domain State V1 liefern, ohne DB-Row vorzutäuschen. `knowledge_state_initialized` wird nur bei committed Headererzeugung auditiert.

## 55. Existing Projects

Migration erzeugt Tabellen/Constraints, aber keine Header, Claims oder künstlichen Conversation IDs. Bestehende Projekte lesen bis zum ersten Apply als leerer State Version 1. Es gibt keine Fake Claims und keinen automatischen State >1. Unique Project Header und lazy transactionale Upsert/lock lösen Concurrent First Apply; der Verlierer trifft CAS/Idempotency deterministisch.

## 56. Migration Strategy

Nur additive neue Migration(en), keine bestehende Datei ändern. Reihenfolge im Folgepaket: closed enums/checks und Header; Claims; typed Evidence; Applications; FKs/unique/append-only triggers; RLS/Grants; kurze CAS-RPC; serverseitige DTO/Adapter/Service; Tests. Keine Productiondaten werden fachlich transformiert. Rollout bleibt fail-closed und Deletegate unverändert. Optionaler Backfill beschränkt sich später höchstens auf leere Header V1, ist aber nicht empfohlen.

## 57. Minimal Implementation Package

**AP-15-05-03-03-03-01 — Persistent Knowledge State & Descriptive Claim Apply Baseline**:

- project-scoped State Header V1/Schema V1;
- typed append-only Claims und project-evidence Links;
- Transition Application Authority;
- ausschließlich bestehender reviewed positive descriptive Proposalpfad;
- serverseitige Reconstruction, pure Engine, CAS-RPC, Idempotenz, atomic Proposalterminalisierung/Audit;
- schmaler Current-State-/History-Read;
- Tests einschließlich Planner-Adapter sowie unveränderter Readiness/Missing-Ausgabe.

Ausgeschlossen bleiben Customer-/Technical Claim Persistence, Correction/Invalidation/Supersession Commands, Auto-Apply, Conversation/Message Persistence, Projection, Delete, Offer/Execution, Plannerregeln, Readiness/Missing Persistence, UI, WhatsApp und Vision.

## 58. Recommended Follow-ups

1. **AP-15-05-03-03-03-01:** Persistent Knowledge State & Descriptive Claim Apply Baseline.
2. **AP-15-05-03-03-03-02:** Correction / Invalidation / Supersession Authority; vor Dependency Projection zwingend.
3. **AP-15-05-03-03-03-03:** Media Dependency Projection, nach Correction; Gate zunächst dark/fail-closed.
4. **AP-15-05-03-03-03-04:** Offer / Execution Authority (mit eigenem Owner-Freeze, falls weiterhin unvollständig).
5. **AP-15-05-03-03-03-05:** Final Delete Gate Integration erst nach allen Authorities/Production Validation.
6. Danach Lifecycle UI; vor WhatsApp-Claims Conversation-/Message-Authority; anschließend WhatsApp Media Audit und Vision Audit.

Diese Reihenfolge bestätigt Correction vor Projection und Offer/Execution vor finalem Delete. Offer Authority kann parallel konzeptionell auditiert werden, darf den Apply-Baseline-Scope aber nicht aufblasen.

## 59. Owner Decisions

Status `recommended` bedeutet Audit-Empfehlung, `owner_required` ein vor Implementierung explizit zu bestätigender Freeze.

| # | Entscheidung/Varianten | Empfehlung | Hauptrisiko | Status |
|---:|---|---|---|---|
| 1 | Persistence A–E | E Hybrid | zweite/unklare Wahrheit | owner_required |
| 2 | Project vs Conversation Scope | project-scoped | WhatsApp-Wissensinseln | owner_required |
| 3 | Conversation prerequisite ja/nein | nein für descriptive; ja vor Messageclaims | fake Provenienz | owner_required |
| 4 | eager/lazy State | lazy beim ersten Apply | Phantomheader/Komplexität | recommended |
| 5 | Initial 0/1 | 1 | Domainbruch | recommended |
| 6 | Schema Version | separate positive `schema_version=1` | Semantik-/Statevermischung | recommended |
| 7 | typed Spalten/JSON/Subtabellen | typed XOR-Spalten | Verlust/freies JSON | owner_required |
| 8 | Claim Evidence | append-only Join | Mehrfachprovenienzverlust | recommended |
| 9 | polymorphe Sources A–D | nullable typed FKs, additiv | Generic-FK-Lücke | owner_required |
| 10 | Project Evidence FK | direkte projectgleiche FK im Join | Locator-/Media-Kopplung | recommended |
| 11 | Application Table ja/nein | ja | kein Replaybeweis | recommended |
| 12 | Idempotency | Digest aus Project/State/Proposal+Revision/Review/Expected | Double Apply | owner_required |
| 13 | CAS | strict Expected == Current | Lost Update | recommended |
| 14 | Pure Engine/RPC Split | TS Engine + schmale CAS-RPC | Logikduplikation/TOCTOU | owner_required |
| 15 | Claims mutable/append-only | append-only | Audit-/Protectionverlust | recommended |
| 16 | History retain/delete | retain | Supersession nicht erklärbar | recommended |
| 17 | Contradiction persisted/derived | pure on-read | duplizierte Wahrheit | recommended |
| 18 | Reviewer Protection | Evidence Actor/Status rekonstruiert | stilles Überschreiben | recommended |
| 19 | Strength nullable/required | nullable allgemein, descriptive required | Defaulteskalation | owner_required |
| 20 | Observation Apply Check | active/revision/provenance erneut | stale Befund | recommended |
| 21 | Tombstoned Apply | verbieten | unverifizierbarer Apply | owner_required |
| 22 | no-change Proposalstatus | `applied`, Result `no_change` | Workflow-/Resultmix | recommended |
| 23 | technical failure | rollback + retry same key | falsches Terminal | recommended |
| 24 | Audit/Application | getrennte Records, beide atomar | Audit als Authority | recommended |
| 25 | Apply actor | Admin-only MVP | unerlaubte Claimmutation | recommended |
| 26 | Reviewer Apply später | separate Capability/Package | Rolleneskalation | owner_required_later |
| 27 | RLS | Admin Project Read; no direct mutation | Clientwrites | owner_required |
| 28 | Existing Projects | kein Backfill; lazy V1 | Fake State/Claims | recommended |
| 29 | Planner Context Adapter | pure Regression in -01 | Persistenzverlust | recommended |
| 30 | Correction vor Projection | ja | Delete übersieht offenen Case | recommended |
| 31 | Offer Authority Order | nach Projection-Schema, vor final Gate; Audit früh | weiterhin unknown Delete | owner_required |
| 32 | minimales Paket | exakt AP-...-01 oben | Scope Creep | owner_required |

## 60. Future Tests

Später, nicht in diesem Audit:

- State lazy Init, V1, Schema V1, erster Claim V2 und Multi-Claim einmal N→N+1;
- project-scoped Unique Authority, kein persistierter Fake-Conversationwert, spätere projectgleiche Conversation-Provenienz;
- alle String/Number/Boolean/Unknown-Formen einschließlich `unknown`, `not_applicable`, `requires_site_check`, finite/integer/property checks;
- nullable Legacy Strength, descriptive required, keine Strength-/Epistemic-Eskalation;
- mehrere Evidence Links, typed Project-Evidence-FK, unsupported Source fail closed, kein Locator/URL/PII;
- serverseitige Proposal-/Review-/Observation Reconstruction und ausschließlich `approved_apply_pending`;
- CAS stale, zwei concurrent Applies, zwei Tabs, duplicate Key/payload conflict;
- successful Apply, no-change ohne Stateversion, Timeout Replay ohne zweite Mutation/Event;
- Contradiction pure derivation, erlaubte Supersession, History, Reviewer Protection;
- Observation invalidation, Evidence invalidation, Media tombstone/Delete Race, Projectstatus Race;
- Rollback bei Claim-, Evidence-, Proposalstatus-, Application- und Auditfehler;
- RLS/Grants/append-only Trigger, Admin capability, Customer/Reviewer denied, kein direct Client DML;
- Current Read/effective Claims/History pagination und pure-vs-DB-Adapter parity;
- Planner Evidence Context aus persistiertem Claim; technische Readiness und Missing unverändert;
- Auditmetadata sanitized und Application Record vom Audit getrennt.

## 61. Production Gates

1. Keine Fake Knowledge-/Conversation-Persistenz.
2. Keine direkten Client Claim/Header/Evidence/Application Writes oder Deletes.
3. Apply ausschließlich aus gültigem `approved_apply_pending` + gebundener Approval Review.
4. Striktes State CAS; kein Auto-Rebase.
5. Identischer Apply ist idempotent: kein zweiter Claim, keine zweite Version, kein zweites Apply Event.
6. Claims/Evidence/Application append-only; History erhalten.
7. Reviewer-/manual-corrected Protection wird aus persistierter Provenienz rekonstruiert.
8. Keine Strength- oder Epistemic-Defaulteskalation.
9. Typed Values einschließlich Nullstatus bleiben verlustfrei.
10. Evidence-Provenienz und Projectgleichheit sind FK-gesichert.
11. Keine Storage-Locators, Signed URLs, Raw Payloads, Message Texte oder PII.
12. Fehlgeschlagene Transaktion hinterlässt keinen partiellen Claim/Header/Proposalstatus/Audit.
13. Proposalterminalisierung und State/Application sind atomar konsistent.
14. Timeout-Replay ist sicher und liefert das committed Result.
15. Project mismatch ist DB-seitig unmöglich; Conversation ist explizit Provenienz, nicht fake Authority.
16. Observation/Evidence/Media werden am Applyzeitpunkt erneut geprüft; Tombstone fail closed.
17. Duplicate führt zu Workflow `applied` + Result `no_change`, State bleibt N.
18. Kein automatisches descriptive `false`, Conflict oder Supersession.
19. Descriptive Claim verändert technische Readiness/Missing nicht.
20. Apply schließt nur Proposal-/Reviewdependency; Evidence Delete bleibt bis Correction/Projection/Offer/Execution fail-closed.

## 62. Scope Confirmation

Es wurde ausschließlich diese Auditdatei erstellt. Keine Implementierung, Migration, DB-/SQL-/RPC-/RLS-Änderung, Knowledge-State-/Claim-Persistenz, Claim Apply, Correction, Proposal-/Review-/Delete-/Offer-/Planner-/Readinessänderung, UI, WhatsApp, Vision oder AI; keine Tests und keine `package.json`-Änderung. Anwendungstests wurden ausdrücklich nicht ausgeführt.

## 63. Status

**Auditstatus: READY FOR OWNER DECISION**

`PERSISTENT EVIDENCE INTERPRETATION AUTHORITY — IMPLEMENTED`

`PERSISTENT OBSERVATION AUTHORITY — IMPLEMENTED`

`PERSISTENT CLAIM PROPOSAL AUTHORITY — IMPLEMENTED`

`PERSISTENT HUMAN REVIEW AUTHORITY — IMPLEMENTED`

`APPROVED APPLY PENDING — IMPLEMENTED`

`PERSISTENT KNOWLEDGE STATE AUTHORITY — NOT IMPLEMENTED`

`PERSISTENT REVIEWED CLAIM APPLY — NOT IMPLEMENTED`

`PERSISTENT CORRECTION AUTHORITY — NOT IMPLEMENTED`

`AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — NOT IMPLEMENTED`

`OFFER / EXECUTION AUTHORITY — NOT COMPLETE`

`EVIDENCE-BOUND DELETE — STILL FAIL-CLOSED`

`WHATSAPP — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`
