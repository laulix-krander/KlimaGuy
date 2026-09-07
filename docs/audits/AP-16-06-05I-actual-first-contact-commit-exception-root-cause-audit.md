# AP-16-06-05I — Actual First-Contact Commit Exception Root-Cause Audit

## Abschlussbericht

| Feld | Ergebnis |
|---|---|
| Branch | `codex/ap16-06-05i-actual-first-contact-commit-exception-audit` |
| Baseline Commit | `716f99f570ef224c42b8a332e32f5dc45f0481d6` (aktueller bereitgestellter `main`-Merge) |
| Commit SHA | Git-Commit mit Message `docs: audit actual first contact commit exception`; die unveränderliche SHA steht in Git/PR und kann nicht Bestandteil ihres eigenen Inhalts sein |
| Audit Artifact | `docs/audits/AP-16-06-05I-actual-first-contact-commit-exception-root-cause-audit.md` |
| Audit Result | **ROOT CAUSE NOT YET PROVEN** |
| AP-16-06-05H Root Cause Valid | **NEIN** |
| Production Function Signature | `commit_first_contact_initial_prompt(uuid,uuid,integer,integer,uuid,uuid,uuid,uuid,timestamp with time zone,jsonb,text)` |
| Production Function Body Match | **JA** für den vorgegebenen Production-Body und den finalen Repository-Body, insbesondere `set_config(...,'allowed',true)` |
| Actual Exception Reproduced | **NEIN**; diese Arbeitsumgebung besitzt weder Production-Zugang noch eine konfigurierte PostgreSQL-/Supabase-Instanz |
| Exact PostgreSQL/PostgREST Error | Noch unbekannt; `code`, `message`, `details` und `hint` wurden vom produktiven Adapter absichtlich verworfen |
| Root Cause Identified | **NEIN** |
| READY for AP-16-06-05I-1 | **NEIN** |
| Recommended Next Package | Der eine rollbackbare Production-Proof-Step in diesem Dokument; erst danach, falls er eine Exception liefert, `AP-16-06-05I-1` spezifizieren |

Dieser Audit ändert ausschließlich Dokumentation. Er enthält keine Migration und keine Änderung an Planner, Renderer, Recovery, Delivery, Webhook, Scheduler oder OpenAI. Die verbindlichen Production-Fakten werden als bereits erhoben akzeptiert; die ausgeschlossenen Inventare werden nicht als neue Evidenz ausgegeben.

## Ergebnis und Beweisgrenze

AP-16-06-05H ist widerlegt. Sowohl die ursprüngliche Migration als auch der aus Production gelesene Function Body enthalten den gültigen PostgreSQL-Aufruf:

```sql
perform set_config('app.runtime_authority_mutation','allowed',true);
```

Damit existiert der von 05H behauptete zwingende Zwei-Argument-Fehler nicht. Der statische Abgleich in diesem Audit findet auch keinen anderen Fehler, der aus **realem Payload plus finalem Schema logisch zwingend** folgt. Insbesondere sind die JSON-Casts, der minimale Delivery-Insert, der Runtime-Guard, die deferred Beziehungen und der Audit-Insert für den rekonstruierten First-Contact-Payload konsistent. Ohne Ausführung der echten Function darf keiner dieser Punkte zur neuen spekulativen Root Cause erklärt werden.

Der Root-Cause-Standard A oder B ist daher noch nicht erfüllt. Der unten stehende einzelne SQL-Proof-Step führt exakt den deterministischen Payload gegen die echte Production-Function aus, fängt PostgreSQLs Diagnostik innerhalb eines PL/pgSQL-Subtransactionsblocks ab, erzwingt auch die deferred Phase und beendet die äußere Transaktion immer mit `ROLLBACK`.

## Realer RPC-Call-Graph und Fehlerverlust

1. `runProductiveFirstContactInitialization(...)` ruft den server-only Adapter auf.
2. `runFirstContactInitialPrompt(conversationId)` erzeugt einen Supabase-Service-Role-Client.
3. `initializeFirstContactPrompt(...)` ruft `get_first_contact_initial_prompt_context` auf.
4. Bei `eligible` werden Knowledge State und Information Collection im Speicher mit Claims/Items `[]`, Collection Version `0` und Effort-Zählern `0` komponiert.
5. `buildIntermediateAssessment` → `deriveMissingInformation` → `planNextAction` → `renderQuestionTemplate` → `plannerInteractionSnapshotSchema.safeParse` laufen rein in TypeScript.
6. Vier Persistenz-UUIDs sowie Planner-`decision_id` werden mit `randomUUID()` erzeugt; `occurredAt` ist der einmalig gebildete ISO-Wert von `now`.
7. Der Adapter ruft `client.rpc("commit_first_contact_initial_prompt", namedArguments)` auf.
8. PostgREST führt die elfparametrige Production-Function aus. Nur `unique_violation` wird in SQL zu `stale`; jede andere Exception wird erneut geworfen.
9. Supabase liefert bei einer solchen Exception `{ data, error }`. `initializeFirstContactPrompt` prüft nur, ob `error` truthy ist, und gibt den inhaltsfreien Diagnosecode `commit_rpc_failed` zurück. Deshalb beweist der vorhandene Productive Diagnostic nur die Boundary, nicht SQLSTATE oder das fehlernde Statement.

Provider-Auslieferung ist nicht Teil dieses Graphen. Die Commit-Function legt lediglich einen Delivery Command an; sie autorisiert oder versendet keinen Provider-Request.

## Rekonstruktion des realen Payloads

### Deterministische Felder

Aus dem validierten Production-Context folgen unmittelbar:

| RPC-Feld | Reale Quelle / Wert |
|---|---|
| `target_conversation_id` | `ed8e842d-e6f4-4c5d-9305-e723d6f6794c` |
| `expected_project_id` | `75de4d21-e54e-486e-9bff-e8deaace9e85` |
| `expected_knowledge_version` | `1` |
| `expected_runtime_revision` | `1` |
| `target_outbound_text` | `Um welche Gebäudeart handelt es sich?` |

Leere Claims führen in `deriveMissingInformation` für fehlende nicht-projektbezogene Entitäten auf die Project-ID zurück. Candidate-Erzeugung und Ranking wählen deterministisch `building_type`; die Action ist `ask_text`, `entity_type=project`, `entity_id=75de…9e85`, Candidate `50000000-0000-4000-8000-000000000310`, Template `ask_building_type` Version 1 und Answer Type `text`. Das bestehende First-Contact-Testfixture bestätigt genau diese Auswahl und diesen Text.

Der vollständige Snapshot ist ebenfalls deterministisch **bis auf** `decision_id` und `created_at`. Die fünf UUIDs (`decision_id` plus vier Target-IDs) sind Identitäten, keine fachlich variablen Payloadteile. Der SQL-Proof-Step erzeugt sie genau wie der produktive Pfad neu. Ein gemeinsamer `occurred_at` wird einmal bestimmt und sowohl für Action-`created_at` als auch den RPC-Zeitpunkt verwendet. Dies reproduziert die produktive Invariante, ohne historische Zufallswerte erfinden zu müssen.

### Vollständige reale Payload-Shape

Der Proof-Step baut ohne ausgelassene Felder:

- `selected_action`: alle Planner-Felder einschließlich Score-Breakdown (Total 16), Progression/Eligibility/Gain-Felder, Fallbacks und Reason Codes;
- `rendered_interaction`: vollständige kontrollierte deutsche Template-Ausgabe einschließlich Examples, Answer Contract, Options und `customer_visible=true`;
- `target_outbound_text`: exakt `composeRenderedCustomerText(rendered_interaction)`; da Supporting/Help fehlen, ist dies allein der Primary Text.

Nicht statisch rekonstruierbar sind lediglich die ursprünglichen zufälligen UUID-Werte und Wall-Clock-Zeit des bereits fehlgeschlagenen Calls. Sie beeinflussen keinen Schema- oder fachlichen Contract. Neue Werte sind erforderlich, um den echten Authority-Pfad kollisionsfrei erneut zu prüfen.

## Statement-für-Statement-Ausführungsrisiko

| Mutierender Schritt | Prüfung mit realem Payload und finalem Schema | Auditurteil |
|---|---|---|
| Snapshot INSERT | IDs neu; Conversation/Project stimmen; Revision 2, Knowledge 1, Sequence 1; Schema-Version 1; Action/Render sind JSON-Objekte unter Größenlimit. Die zwei ausgehenden FKs werden explizit deferred. | Kein zwingender Fehler. |
| Message INSERT | Nächste Sequence ist bei `outbound count=0` gleich 1; `outbound`, `text`, `system`, gültiger Timestamp und ausreichend langer Idempotency Key. Conversation-Lock serialisiert den Authority-Pfad. | Kein zwingender Fehler. |
| Message Text INSERT | Parent Message existiert, Body ist nicht leer und unter 20.000 Zeichen. Append-only-Schutz betrifft UPDATE/DELETE, nicht INSERT. | Kein zwingender Fehler. |
| Pending INSERT | Alle Casts und Text-Checks passen; `ask_text` ist erlaubt, Status defaultet auf `pending`, Message/Snapshot-Bindings sind konsistent. | Kein zwingender Fehler. |
| Delivery Command INSERT | Alle fünf expliziten IDs/FKs sind vorhanden. Der finale Defaultzustand ist unten vollständig geprüft. | Minimal-Insert ist final-schema-gültig. |
| Runtime Command INSERT | `activate_interaction` ist Enum-Wert; `first-contact-initial-prompt:v1` erfüllt Länge/Unique, Revision 1→2, `completed` ist erlaubt, System Actor ist ein verifizierter `auth.users`-FK. | Kein zwingender Fehler. |
| `set_config` | Drei Argumente; `true` begrenzt Authority auf die Transaktion. | Gültig; 05H ausgeschlossen. |
| Runtime State UPDATE | Neue Header-Checks, Guard und active Snapshot stimmen mit Revision 2/Pending überein. | Kein zwingender Fehler. |
| Effort State UPDATE | Vorhandene Row wechselt von `(0,0,0,rev 1)` auf `(1,0,0,rev 2)`; Nichtnegativ-Checks bleiben erfüllt. | Kein Trigger und kein zwingender Fehler. |
| Audit Log INSERT | Actor-FK, Entity und JSON sind gültig; Textfelder sind NOT NULL; ID/Timestamp defaulten. | Kein zwingender Fehler. |
| Transaction completion | Alle drei zirkulären FKs und der deferred Snapshot-Guard sehen den vollständigen Zustand. | Kein zwingender Fehler. |

`resolve_system_actor()` bleibt ein tatsächlich ausgeführter Seiteneffekt (Aktualisierung von `verified_at`), aber der System Actor wurde in Production bereits als gültig verifiziert. Der Seiteneffekt wird im Proof-Step ebenfalls mit der Gesamttransaktion zurückgerollt.

## JSON → SQL Cast Analysis

| SQL-Ausdruck | Reales JSON | TypeScript-Garantie | SQL-Ergebnis |
|---|---|---|---|
| `(action->>'decision_id')::uuid` | neue RFC-UUID aus `randomUUID()` | `selectedNextActionSchema` verlangt UUID; Snapshot validiert Action und gleiche Render-ID | gültige UUID |
| `(action->>'entity_id')::uuid` | `75de4d21-e54e-486e-9bff-e8deaace9e85` | Missing-Information- und Action-Schema verlangen UUID | gültige UUID |
| `(action->>'template_version')::integer` | JSON Number `1`; `->>` liefert Text `1` | positive Integer-Version | Integer 1 |
| `(action->>'based_on_state_version')::integer` | JSON Number `1`; `->>` liefert Text `1` | positive Integer und Snapshot Action | Integer 1 |

`entity_id` kann im produktiven Planner-Output weder `null` noch leer oder nicht-UUID sein: Zod verwirft dies vor dem RPC. Für den leeren First-Contact-Knowledge-State ist `entity_type=project` ausdrücklich mit der realen Project-ID gekoppelt. `decision_id` wird als UUID erzeugt und nochmals von Action- sowie Snapshot-Schema geprüft. JSON Numbers werden nicht als TypeScript-Strings gerendert; PostgreSQLs `->>` normalisiert sie dennoch erwartungsgemäß auf castbaren Text. Es gibt für diesen Payload keinen Unterschied zwischen TypeScript-Validierung und diesen vier SQL-Erwartungen.

Eine allgemeine SQL-Robustheitslücke bleibt: Der Function-Guard castet `based_on_state_version` schon während der manuellen JSON-Prüfung und die drei übrigen Werte beim INSERT. Ein fremder, nicht über TypeScript validierter Caller könnte damit `22P02` erzeugen. Das erklärt den gegebenen Lauf nicht, weil der produktive Pfad nachweislich die strikten Schemas passiert und die realen Werte oben gültig sind.

## Delivery Minimal Insert Analysis

Finaler Zustand nach Basis-, Identity/Retry- und Lease/Recovery-Migration:

- `provider NOT NULL DEFAULT 'whatsapp'` und `status NOT NULL DEFAULT 'pending'`;
- `attempt_count NOT NULL DEFAULT 0 CHECK 0..3`;
- `next_attempt_at`, `dispatch_started_at`, `dispatch_attempt_number`, `dispatch_token` nullable; der Dispatch-Tuple-CHECK akzeptiert ausschließlich-all-NULL;
- `execution_owner_id`, `execution_lease_expires_at`, `last_execution_started_at` nullable; `execution_attempt_count NOT NULL DEFAULT 0`; der Lease-Tuple-CHECK akzeptiert beide Lease-Werte NULL;
- `provider_message_binding_id`, claim/accepted/delivered/read/failed/failure/retry fields nullable;
- `(status='sending')=(claim_token is not null)` ist für `pending`/NULL wahr;
- der `updated_at`-Trigger ist nur `BEFORE UPDATE`, also nicht beim INSERT aktiv;
- Basis-Unique `(provider,transport_binding_id,internal_message_id)` und partieller WhatsApp-Unique auf `internal_message_id` kollidieren laut Production-Fakten nicht.

Damit ist der 05E-Minimal-Insert im finalen Repositoryschema gültig. Er erzeugt `whatsapp/pending`, Attempts 0, vollständige Dispatch-Markierung NULL und vollständige Execution Lease NULL. Keine spätere productive-recovery-Migration verschärft diesen Insertvertrag.

## Runtime Guard Analysis

`guard_runtime_identity` wird als `BEFORE UPDATE OR DELETE` sowohl für Pending als auch Runtime verwendet. Beim Runtime-UPDATE ist die Pending-Identity-Bedingung durch `tg_table_name` kurzgeschlossen. Danach verlangt der Guard ausschließlich:

```text
current_setting('app.runtime_authority_mutation', true) = 'allowed'
```

Der unmittelbar vorherige `set_config(...,true)` erfüllt dies transaktionslokal. `set_updated_at` ergänzt nur `updated_at`.

`guard_active_planner_snapshot` ist ein deferred Constraint Trigger. NEW hat Conversation/Project des OLD-Headers, Revision 2, unveränderte Knowledge-Version 1, Status `awaiting_customer_answer` und die neue Pending-ID. Zu diesem Zeitpunkt existieren Pending und Snapshot bereits mit denselben IDs, Conversation/Project, Runtime Revision 2 und Knowledge Version 1; Pending defaultet auf `pending`. Runtime Command oder Message Binding werden von diesem Guard nicht gelesen.

Das Runtime-UPDATE ändert weder Project- noch Knowledge-Bindung. Die Runtime-Command-Row beschreibt exakt Expected Revision 1 und Result Revision 2. Es gibt daher im finalen Body keinen Aufruf einer weiteren Guard-Funktion und keinen statisch zwingenden Runtime-Guard-Fehler.

## Deferred Phase Analysis

Unmittelbar vor Return gilt:

1. Snapshot `pending_interaction_id = target_interaction_id`; genau diese Pending Row existiert (**snapshot → pending erfüllt**).
2. Snapshot `outbound_message_id = target_outbound_message_id`; genau diese Message existiert (**snapshot → outbound message erfüllt**).
3. Pending `snapshot_id = target_snapshot_id`; genau dieser Snapshot existiert (**pending → snapshot erfüllt**).
4. Runtime active Pending, Pending Revision/Knowledge und Snapshot-Verknüpfung bilden exakt die vom Constraint Trigger verlangte Join-Row (**active planner snapshot required erfüllt**).
5. Die zusätzliche deferred Runtime-FK auf `active_pending_interaction_id` ist ebenfalls erfüllt.

Der SQL-Proof-Step führt nach dem Function Call ausdrücklich `SET CONSTRAINTS ALL IMMEDIATE` aus. Eine erst bei Transaktionsende auftretende Exception wird dadurch innerhalb des auffangbaren Blocks sichtbar; ein Erfolg bleibt dennoch durch den äußeren Rollback nicht persistent.

## Audit Log Analysis

Der Insert setzt `actor_id` auf die durch `resolve_system_actor()` gelieferte Auth-User-UUID, `entity_type='conversation'`, `entity_id` auf die reale Conversation und `action='first_contact_initial_prompt_committed'`. Metadata enthält nur technische IDs, Project/Conversation, Question/Template Keys, Revision/Version und Result Code. `id` und `created_at` haben Defaults. Das finale Schema hat einen nullable FK von Actor zu `auth.users`, keine Action-/Entity-Enums und keinen Insert-Trigger. Der gegebene verifizierte Actor erfüllt den FK. RLS ist bei Service Role/Function Owner kein statisch erkennbarer Blocker. Auch hier bleibt nur reale Ausführung beweiskräftig.

## Warum die Tests `commit_rpc_failed` nicht entdecken

- `test/first-contact-initial-prompt.test.ts` mockt `InitialPromptRpc.rpc` vollständig. Der Erfolgsfall erfindet `initialized`; der Fehlerfall gibt ein synthetisches `{ error: { message: ... } }` zurück und prüft nur die redigierte Klassifikation. Kein SQL wird ausgeführt.
- Der Block `atomic initial-prompt migration contract` in derselben Datei liest `202609040002_deterministic_initial_prompt_commit.sql` mit `readFileSync` und prüft nur String/Regex-Muster für Locks, Tabellen, Status, Grants und fehlenden Dispatch. Er kompiliert oder vollzieht die Function nicht.
- Planner-Snapshot-, Runtime-Authority-, Delivery-Authority- und Migrationstests sind Domain-Unit- beziehungsweise SQL-Text-Vertragstests. Im Test-Setup existiert keine migration-backed PostgreSQL-Instanz.
- Der einzelne künftig erforderliche Regressionstest ist: alle Migrationen in Reihenfolge auf echtem PostgreSQL anwenden, Auth/Profile/System Actor plus eine isolierte eligible First-Contact-Conversation und Binding/Identity seeden, den **real erzeugten** Planner/Renderer-Payload an die echte Function geben, `SET CONSTRAINTS ALL IMMEDIATE` erzwingen und Snapshot, Message/Text, Pending, Delivery, Runtime Command/Header, Effort und Audit atomar prüfen; Testtransaktion rollbacken. Dieser Test ist erst nach Kenntnis der echten Exception Teil eines Repair-Pakets, nicht dieses Audits.

## Einziger nächster Diagnose-Schritt: rollbackbare Production-Ausführung

Den folgenden Block unverändert in einer Production-SQL-Session ausführen. Er enthält keine PII, keine Secrets und keine Kundennachricht; nur die kontrollierte Template-Frage. Er setzt für `auth.role()` den lokalen Service-Role-Claim, erzeugt alle temporären IDs selbst, führt die echte Function aus, erzwingt deferred Prüfungen und gibt entweder das kontrollierte Resultat oder PostgreSQLs `RETURNED_SQLSTATE`, `MESSAGE_TEXT`, `PG_EXCEPTION_DETAIL` und `PG_EXCEPTION_HINT` als NOTICE aus. Die innere Exception wird gefangen; der abschließende äußere `ROLLBACK` wird daher auch im Fehlerfall erreicht. Es gibt keinen Provider-Aufruf.

```sql
begin;
select set_config('request.jwt.claim.role', 'service_role', true);

do $diagnostic$
declare
  v_conversation constant uuid := 'ed8e842d-e6f4-4c5d-9305-e723d6f6794c';
  v_project constant uuid := '75de4d21-e54e-486e-9bff-e8deaace9e85';
  v_decision uuid := gen_random_uuid();
  v_interaction uuid := gen_random_uuid();
  v_snapshot_id uuid := gen_random_uuid();
  v_message uuid := gen_random_uuid();
  v_delivery uuid := gen_random_uuid();
  v_at timestamptz := statement_timestamp();
  v_action jsonb;
  v_rendered jsonb;
  v_snapshot jsonb;
  v_result jsonb;
  v_state text;
  v_message_text text;
  v_detail text;
  v_hint text;
begin
  v_action := jsonb_build_object(
    'decision_id',v_decision,'project_id',v_project,'conversation_id',v_conversation,
    'based_on_state_version',1,'selected_candidate_id','50000000-0000-4000-8000-000000000310',
    'action_type','ask_text','information_key','building_type','entity_type','project','entity_id',v_project,
    'answer_contract',jsonb_build_object('answer_type','text'),
    'template_key','ask_building_type','template_version',1,
    'fallback_paths',jsonb_build_array('offer_assumption','present_intermediate_result'),
    'reason_codes',jsonb_build_array('missing_for_target'),'priority_band','readiness_blocker','progression_band','room_context',
    'dependency_status','satisfied','collection_eligibility','eligible','revisit_status','not_required',
    'information_gain_status','new_information_expected','collection_path','customer_question',
    'gain_reason_codes',jsonb_build_array('new_information_expected'),
    'score_breakdown',jsonb_build_object(
      'safety_relevance',0,'feasibility_impact',2,'sizing_impact',3,'installation_impact',1,
      'price_risk_impact',1,'readiness_impact',3,'expected_information_gain',3,'answerability',3,
      'customer_effort',-1,'repetition_penalty',0,'contradiction_bonus',0,'dependency_bonus',1,
      'assumption_availability_penalty',0,'site_check_availability_penalty',0,'total',16),
    'created_at',v_at,'created_by_actor_class','system');

  v_rendered := jsonb_build_object(
    'project_id',v_project,'conversation_id',v_conversation,'decision_id',v_decision,
    'template_key','ask_building_type','template_version',1,'locale','de','message_kind','question',
    'primary_text','Um welche Gebäudeart handelt es sich?',
    'examples',jsonb_build_array('Wohnung','Einfamilienhaus','Dachgeschosswohnung'),
    'answer_contract',jsonb_build_object(
      'answer_type','text','required',true,'allows_unknown',true,'allows_skip',true,'min_length',2,'max_length',100,
      'options',jsonb_build_array(
        jsonb_build_object('option_key','unknown','label','Weiß ich nicht','normalized_outcome','unknown'),
        jsonb_build_object('option_key','skip','label','Möchte ich überspringen','normalized_outcome','skip')),
      'examples',jsonb_build_array('Wohnung','Einfamilienhaus','Dachgeschosswohnung'),
      'validation_error_code','text_answer_invalid','maximum_attempts',2),
    'answer_options',jsonb_build_array(
      jsonb_build_object('option_key','unknown','label','Weiß ich nicht','normalized_outcome','unknown'),
      jsonb_build_object('option_key','skip','label','Möchte ich überspringen','normalized_outcome','skip')),
    'customer_visible',true);
  v_snapshot := jsonb_build_object('snapshot_schema_version',1,'selected_action',v_action,'rendered_interaction',v_rendered);

  begin
    v_result := public.commit_first_contact_initial_prompt(
      v_conversation,v_project,1,1,v_interaction,v_snapshot_id,v_message,v_delivery,
      v_at,v_snapshot,'Um welche Gebäudeart handelt es sich?');
    set constraints all immediate;
    raise notice 'AP-16-06-05I result=%', v_result;
  exception when others then
    get stacked diagnostics
      v_state = returned_sqlstate,
      v_message_text = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint;
    raise notice 'AP-16-06-05I error code=% message=% details=% hint=%',
      v_state, v_message_text, coalesce(v_detail,''), coalesce(v_hint,'');
  end;
end
$diagnostic$;

rollback;
```

Nur die eine NOTICE-Zeile `result=...` oder `error code=... message=... details=... hint=...` ist als Diagnoseergebnis zu übernehmen. Keine Session-Konfiguration, Environment-Variable oder sonstige Query-Ausgabe teilen. Falls das Ergebnis statt einer Exception `initialized` ist, beweist der Rollback, dass der aktuelle Function-/Schema-/State-Pfad funktioniert; dann muss der produktive PostgREST-Aufruf (einschließlich zeitgleichem Zustand oder Infrastruktur) gesondert neu eingegrenzt werden, aber dieser Audit benennt bewusst keinen zweiten Schritt.

## Repair-Gate

`AP-16-06-05I-1 — First-Contact Commit Exception Repair` wird **noch nicht** definiert. Erst eine konkrete Notice mit SQLSTATE und Message (oder ein kontrolliertes Resultat, das die DB-Function entlastet) schafft die erforderliche Authority für das kleinste Repair-Paket. Insbesondere darf keine Repair-Migration auf AP-16-06-05H oder auf eine der hier nur abstrakt möglichen Exception-Klassen gestützt werden.

## Endergebnis

**ROOT CAUSE NOT YET PROVEN**

**AP-16-06-05H ROOT CAUSE VALID: NEIN**

