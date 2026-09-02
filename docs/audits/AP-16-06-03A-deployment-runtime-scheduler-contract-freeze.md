# AP-16-06-03A — Deployment Runtime & Scheduler Contract Freeze

**Baseline:** `6e76ebefe0cbd917face4c0693f5e55febf72e18`  
**Scope:** Architektur-Audit und verbindlicher Implementierungsvertrag; keine Produktimplementierung.

## 1. Executive Result

Die zuvor fehlenden Deployment-Fakten sind durch den Projektbetreiber verbindlich bestätigt. Der aktuelle deterministische Conversation Cycle kann im bereits `await`enden WhatsApp-Webhook-Pfad ausgeführt werden. Die unabhängige Recovery wird nicht durch Vercel Cron, sondern durch **Supabase Cron (`pg_cron`) mit einer durch Supabase Vault geschützten HTTP-Ausführung (`pg_net`)** alle fünf Minuten ausgelöst. Das Ziel ist ein schmaler, serverseitiger Next.js-Entry-Point auf Vercel; die fachliche Recovery-Authority bleibt vollständig beim AP-16-06-02-Runner.

Der Recovery-Lauf entdeckt höchstens **10** Commands, verarbeitet sie **sequenziell** und startet nach Ablauf eines 45-Sekunden-Startbudgets keinen weiteren Command. Für die Route gilt ein Gesamtbudget von **60 Sekunden**. Das ist ein bewusst konservatives operatives Budget innerhalb des als ausreichend bestätigten aktuellen Function-Fensters, keine Aussage über ein universelles Vercel-Planlimit.

Es wird keine zusätzliche Plattform benötigt. Supabase Cron, Database Webhooks/HTTP über `pg_net` und Vault sind Fähigkeiten des bereits eingesetzten verwalteten Supabase-Stacks. Ihre konkrete Aktivierung, der Vault-Eintrag und der Cron-Eintrag sind Deployment-Konfiguration des späteren AP-16-06-03-Pakets; ihr Fehlen im Repository ist kein Anlass, eine weitere Recovery-Plattform einzuführen.

**AUDIT RESULT: READY**

## 2. Confirmed Deployment Facts

Für diesen Freeze gelten die vom Betreiber im produktiven Vercel Dashboard bestätigten Fakten als Authority:

- Projekt: **KlimaGuy**
- Hosting: **Vercel**
- aktueller Plan: **Hobby**
- Vercel Cron darf in diesem Vertrag höchstens einmal täglich laufen; insbesondere ist `*/5 * * * *` dort nicht zulässig.
- Eine tägliche Recovery erfüllt die interaktive Anforderung bei einer fünfminütigen Execution Lease nicht.
- Das aktuelle Vercel-/Fluid-Compute-Ausführungsfenster reicht für den rein deterministischen Cycle grundsätzlich aus.
- Der aktuelle Cycle benötigt weder langlaufende Background Execution noch Heartbeat.

Diese Punkte werden nicht erneut als offene Repository-Fragen behandelt. Die heutige Runtime-Entscheidung gilt nur für den aktuellen, deterministischen Stand.

## 3. Current Runtime Path

Der produktive Pfad ist aktuell:

```text
POST /api/webhooks/whatsapp
→ createWhatsAppWebhookHandlers(...).POST
→ persistWhatsAppInboundText(...)
→ Ergebnis status === "recorded" && cycle_eligible === true
→ await triggerPersistentMessageCycle({ message_id: internal_message_id })
→ serviceClient().rpc("claim_customer_message_cycle", ...)
```

`lib/server/whatsapp/webhook.ts` verifiziert Signatur und Payload, awaited die Persistenz und ruft nur für eine neu aufgezeichnete, cycle-fähige Nachricht den ebenfalls awaited Trigger auf. Duplikate und nicht cycle-fähige Nachrichten starten keinen Immediate Cycle.

Der **Legacy Claim** liegt exakt in `triggerPersistentMessageCycle(...)` in `lib/server/whatsapp/ingestion.ts`: Die Funktion erzeugt einen Service-Role-Client und ruft direkt `claim_customer_message_cycle` auf. Dieser Claim reserviert Zustand, führt aber keine TypeScript-Orchestrierung aus. AP-16-06-03 muss diesen direkten RPC vollständig entfernen und den Trigger stattdessen genau einmal `await runPersistentCustomerMessageCycle(dependencies, { message_id })` ausführen lassen. Ein Vor-Claim ist verboten: Der Runner erzeugt die Owner-ID, und seine leasegebundene Data Source führt atomar `acquire_customer_message_cycle_execution` einschließlich Claim aus.

## 4. Immediate Trigger Contract

Der verbindliche Immediate-Vertrag lautet:

```text
Inbound-Persistenz
→ wenn recorded + cycle_eligible: await Recoverable Runner
→ Meta HTTP 200 nach kontrollierter Runner-Behandlung
```

Der Runner darf im aktuellen Webhook synchron awaited werden. Er führt ausschließlich den deterministischen persistenten Cycle aus: serverseitige Supabase-RPCs für Acquire/Read/Commit beziehungsweise Failure/Review und TypeScript-Domain-Orchestrierung. Er enthält weder OpenAI-/LLM-Calls noch WhatsApp-Outbound-/Graph-API-Calls. Die fünfminütige Lease ist eine Crash-/Ownership-Grenze, kein erwartetes Laufzeitziel und keine Aufforderung, die Function fünf Minuten laufen zu lassen.

Unzulässig sind Fire-and-forget-Promises, absichtlich nicht awaited Work, `setTimeout`, `setInterval`, eine In-Memory Queue oder eine vermeintliche Background-Ausführung nach der Response. Der unmittelbare Aufruf führt genau einen Runner-Versuch aus und besitzt keine interne Retry-Schleife.

## 5. Transport Acceptance vs Cycle Execution

WhatsApp-Inbound-Transport und Conversation-Cycle-Ausführung sind getrennte Authorities:

- Signatur-, Syntax- oder Inbound-Persistenzfehler werden nach dem vorhandenen Transportvertrag mit einem Nicht-2xx-Status beantwortet.
- Sobald eine Inbound-Nachricht erfolgreich persistent als `recorded` angenommen wurde, darf ein nachfolgendes Runner-Ergebnis oder eine Runner-Exception diese Annahme nicht zurückrollen.
- `completed`, `human_review`, `already_terminal`, `failed`, `stale`, `busy` und `ownership_lost` ändern die Meta-Antwort nicht in einen Cycle-Retry-Status. Nach kontrollierter Behandlung folgt HTTP 200 ohne Domain-Inhalte.
- Meta Webhook Replay ist deshalb keine Conversation-Cycle-Retry-Authority. Ein liegen gebliebener Versuch wird nach Lease-Ablauf durch Discovery plus Recovery Scheduler wieder aufgenommen.

Der vorhandene innere `try`/`catch` um `await triggerCycle(...)` bildet diese Trennung bereits ab. AP-16-06-03 muss sie bei der Runner-Anbindung erhalten, statt einen Cycle-Fehler in den äußeren Transportfehlerpfad zu heben.

## 6. Vercel Hobby Constraints

Vercel bleibt Runtime für Webhook und Recovery Entry Point, ist im aktuellen Hobby-Vertrag aber **nicht** der primäre Recovery Scheduler. Ein täglicher Vercel Cron ist keine hinreichende Ersatzlösung; ein nicht zulässiger Fünf-Minuten-Vercel-Cron wird nicht konfiguriert. Ein Pro-Upgrade ist keine MVP-Voraussetzung.

Die Route darf trotzdem als normale Vercel Function von einem autorisierten externen Taktgeber aufgerufen werden. Scheduler-Authority und Function-Runtime sind damit bewusst getrennt.

## 7. Recovery Requirement

`CONVERSATION_CYCLE_LEASE_SECONDS` beträgt `5 * 60`. Die Recovery muss ungefähr in derselben Größenordnung takten, damit ein Prozessabbruch zeitnah nach Lease-Ablauf übernommen werden kann. Der Scheduler läuft daher alle fünf Minuten. Discovery bleibt datenbankautoritativ: Nur `discoverRecoverableConversationCycles(...)` entscheidet über abgelaufene beziehungsweise legacy-lease-lose Commands.

At-least-once-Aufrufe und überlappende Ticks sind zulässig. Lease und Fencing machen einen gültig geleasten Command `busy` und verhindern Mutation durch einen alten Owner. Sie sind jedoch kein Grund für absichtliche Parallelität.

## 8. Scheduler Options Considered

| Option | Entscheidung | Begründung |
|---|---|---|
| Vercel Cron auf Hobby | verworfen | Fünf Minuten sind im bestätigten Plan nicht zulässig; einmal täglich erfüllt Recovery nicht. |
| Supabase Cron → direkter SQL-Domain-Cycle | verworfen | `pg_cron` kann den TypeScript-Runner, Domain-Orchestrierung, Zod-Grenzen und Data-Source-Komposition nicht ersetzen. SQL darf keine zweite Cycle-Authority rekonstruieren. |
| Supabase Cron → Supabase Edge Function → Vercel/Runner | verworfen | Eine zusätzliche Function-Hopf- und Secret-Grenze ist unnötig; `pg_net` kann den HTTPS-Entry-Point direkt mit Header aufrufen. |
| Supabase Cron + Vault + `pg_net` → Vercel Recovery Entry Point | **gewählt** | Nutzt den vorhandenen Supabase-/Vercel-Stack, unterstützt den Fünf-Minuten-Takt und kann einen geheimen Authorization Header serverseitig mitsenden. |
| zusätzliche Scheduler-Plattform | nicht erforderlich | Erst nötig, falls die ausgewählten verwalteten Supabase-Fähigkeiten im produktiven Projekt entgegen diesem Contract nicht bereitgestellt werden könnten. |

Repository-Befund: Es gibt derzeit keine `config.toml`, Cron-/`pg_cron`-/`pg_net`-/Vault-Migration oder Scheduler-Konfiguration. Vorhanden sind der Supabase-Migrationsstack, die serverseitige Service-Role-Grenze und die nur `service_role` gewährten AP-16-06-02-RPCs. Der ausgewählte Vertrag setzt als externe Supabase-Produkteigenschaft voraus, dass im produktiven Hosted-Supabase-Projekt Cron/`pg_cron`, `pg_net` und Vault aktiviert werden können, Cron `*/5 * * * *` unterstützt und `net.http_post` einen aus Vault gelesenen Bearer Header senden kann. Das ist bei der AP-16-06-03-Deployment-Ausführung zu verifizieren, aber keine offene Architekturentscheidung.

## 9. Selected Recovery Scheduler

**Supabase Cron (`pg_cron`)** ist der Scheduler. Der Job führt keine fachliche SQL-Mutation und keinen Runner in der Datenbank aus. Er liest URL und Secret aus serverseitiger, zugriffsbeschränkter Deployment-/Vault-Konfiguration und stößt mit `pg_net` genau einen HTTPS-POST an den Vercel Recovery Entry Point an:

```text
Supabase Cron / pg_cron
→ pg_net HTTPS POST mit Authorization Header
→ Vercel Next.js Recovery Route
→ discoverRecoverableConversationCycles(..., 10)
→ sequenziell runPersistentCustomerMessageCycle(...)
```

Damit entsteht keine neue fachliche Recovery Authority. Zusätzliche Infrastruktur außerhalb von Supabase und Vercel ist **nicht erforderlich**.

## 10. Recovery Frequency

Der Cron-Ausdruck ist verbindlich **`*/5 * * * *`** (alle fünf Minuten). Der Job führt pro Tick genau einen Request aus. Er besitzt keine Catch-up- oder interne Endlosschleife. Falls ein Tick ausfällt oder noch läuft, übernimmt ein späterer Tick; Lease/Fencing bleibt die Konflikt-Authority.

## 11. Recovery Entry Point

AP-16-06-03 erstellt den kleinsten serverseitigen Entry Point als:

**`POST /api/internal/conversation-cycles/recovery`**  
Datei: **`app/api/internal/conversation-cycles/recovery/route.ts`**

Nach erfolgreicher Authentisierung:

1. zentralen serverseitigen Supabase-Service-Role-Client erzeugen;
2. genau einmal `discoverRecoverableConversationCycles(client, 10)` aufrufen;
3. die zurückgegebenen `source_message_id`-Werte in stabiler Discovery-Reihenfolge sequenziell an `runPersistentCustomerMessageCycle(dependencies, { message_id })` übergeben;
4. pro Command Resultat oder kontrollierte Exception isoliert klassifizieren und Zähler erhöhen;
5. spätestens nach dem Startbudget keine weitere Ausführung beginnen und eine inhaltsarme Erfolgsantwort zurückgeben.

Die Route liest `conversation_cycle_commands` nicht direkt, berechnet Lease-Ablauf nicht nach, mutiert keine Lease und schreibt weder Knowledge noch Runtime. Sie führt keinen direkten Reclaim aus. Alle diese Grenzen bleiben im Runner und seinen Datenbank-Authorities. Andere HTTP-Methoden führen keine Discovery aus und erhalten `405 Method Not Allowed`.

## 12. Authorization Contract

Der Entry Point ist server-only und Machine-to-Machine. Der verbindliche Request-Contract lautet:

```http
Authorization: Bearer <CONVERSATION_CYCLE_RECOVERY_SECRET>
```

Die Route liest zuerst die serverseitige Konfiguration und den einzelnen `Authorization`-Header. Sie akzeptiert ausschließlich exakt das `Bearer`-Schema mit nichtleerem Token. Der Vergleich erfolgt konstantzeitnah über SHA-256-Digests gleicher Länge und `node:crypto.timingSafeEqual`; ein direkter Stringvergleich ist nicht der Implementierungsvertrag.

Fail closed gilt vor jeder Supabase-Client-Erzeugung, Discovery oder Runner-Ausführung:

- fehlendes oder leeres Server-Secret → `503 Service Unavailable`, kein Work;
- fehlender, mehrfach/mehrdeutig übermittelter, falsch formatierter oder nicht übereinstimmender Header → `401 Unauthorized`, kein Work;
- Secret in Query, Body oder Cookie → niemals akzeptieren;
- Response enthält weder Secret noch Vergleichsdetails.

Die Scheduler-Technologie ist nur deshalb gewählt, weil `pg_net` einen expliziten HTTP-Header setzen und der Wert serverseitig aus Supabase Vault bezogen werden kann. Der Cron-SQL-Text darf den Secret-Wert nicht als Literal enthalten.

## 13. Secret Contract

- **Environment Variable in Vercel:** `CONVERSATION_CYCLE_RECOVERY_SECRET`
- **Header:** `Authorization`
- **Wertformat:** `Bearer ${CONVERSATION_CYCLE_RECOVERY_SECRET}`
- **Scheduler-Speicher:** eigener Supabase-Vault-Secret-Eintrag; der Wert muss identisch sein, der konkrete Vault-Name kann ebenfalls `CONVERSATION_CYCLE_RECOVERY_SECRET` lauten.
- **Vergleich:** SHA-256 beider UTF-8-Token, anschließend `timingSafeEqual`; keine Normalisierung, kein Trimmen des Tokenwerts und kein Fallback auf andere Secrets.
- **Rotation:** koordinierte Deployment-Änderung; es gibt in diesem MVP-Vertrag nur ein aktives Secret und kein Query-Parameter-Fallback.

Dieses Audit legt nur Namen und Vertrag fest. Es erzeugt, speichert oder konfiguriert keinen Secret-Wert und ergänzt `.env.example` noch nicht.

## 14. Batch Size

Die feste Recovery-Batch-Größe ist **10**. Sie liegt deutlich unter der technischen Discovery-Obergrenze 100, begrenzt Supabase-Roundtrips und Domain-Arbeit pro Function und ist für den angenommenen MVP-Traffic ausreichend. Die Route darf den Limit-Wert weder aus Query noch Body übernehmen.

Ein Tick verarbeitet nur den einmal entdeckten Snapshot von höchstens zehn Rows. Er paginiert nicht, entdeckt nach Abschluss nicht erneut und versucht nicht, den gesamten Rückstand abzubauen. Der nächste Fünf-Minuten-Tick übernimmt verbleibende Commands.

## 15. Concurrency

Recovery läuft **sequenziell (Concurrency 1)** in der von der DB-Discovery gelieferten Reihenfolge. Es gibt kein `Promise.all`, keinen Worker-Pool und keine Parallelitätsoption aus dem Request. Das minimiert Last und Laufzeitkonkurrenz im MVP. Lease/Fencing bleibt Schutz gegen externe Überlappung, nicht Rechtfertigung für interne Parallelität.

## 16. Runtime Budget

Für die Recovery Route gilt ein konservatives **Gesamtbudget von 60 Sekunden** und ein **Startbudget von 45 Sekunden**, gemessen mit einer monotonen Uhr ab Beginn des autorisierten Handlers:

- Discovery erfolgt einmal und zählt zum Gesamtbudget.
- Solange weniger als 45 Sekunden vergangen sind, darf das nächste der höchstens zehn Elemente gestartet werden.
- Ab 45 Sekunden wird kein weiterer Runner gestartet; ein bereits gestarteter deterministischer Runner wird awaited und nicht künstlich abgebrochen.
- Anschließend antwortet die Route innerhalb des 60-Sekunden-Ziels. Ein Plattformabbruch bleibt durch die fünfminütige Lease recoverable.

Die Implementierung soll die Vercel-Route passend auf höchstens 60 Sekunden konfigurieren, soweit für den Deployment-Runtime-Contract erforderlich. Sie darf weder bis zum Lease-Ende warten noch unbounded arbeiten. Das vom Betreiber bestätigte Function-Fenster gilt als ausreichend für aktuellen deterministischen Einzel- und 10er-Bounded-Workload; reale Latenz und Headroom müssen nach Deployment über ausschließlich inhaltsarme Metriken beobachtet werden. Wird das Budget regelmäßig erreicht, wird nicht parallelisiert, sondern Batch/Runtime in einem neuen Contract überprüft.

Der Immediate-Pfad führt nur einen Cycle aus und hat keine eigene Batch-Schleife. Für ihn gilt ebenfalls: vollständig awaiten, keine Background-Fortsetzung und keine künstliche Fünf-Minuten-Laufzeit.

## 17. Failure Isolation

Jeder Recovery-Command hat eine eigene kontrollierte Result-Behandlung. Eine Exception wird an der per-command-Grenze in `failed` gezählt; der nächste Command darf innerhalb des Startbudgets weiterlaufen. Es gibt pro entdecktetem `source_message_id` höchstens einen Runner-Aufruf pro Tick und keine interne Retry-Schleife.

Result-Mapping:

| Runner Result | Zähler / Behandlung |
|---|---|
| `completed` | `completed += 1` |
| `human_review` | `human_review += 1` |
| `failed` oder kontrollierte Exception | `failed += 1` |
| `busy` | `busy += 1` |
| `stale` | `stale += 1` |
| `ownership_lost` | `ownership_lost += 1` |
| `already_terminal` | attempted, aber keine der geforderten terminalen Fehlerkategorien; optional eigener inhaltsarmer `already_terminal`-Zähler |

`attempted` steigt unmittelbar vor jedem Runner-Aufruf. Wegen des Zeitbudgets kann `attempted < discovered` sein. Kein Resultat löst in der Route eine zweite Persistenz, Lease-Mutation oder einen zweiten Runner-Aufruf aus.

## 18. Observability

Minimal zulässig sind ausschließlich aggregierte, nicht personenbezogene Betriebsdaten pro Request:

- `discovered_count`
- `attempted_count`
- `completed_count`
- `human_review_count`
- `failed_count`
- `busy_count`
- `stale_count`
- `ownership_lost_count`

Optional zulässig sind `already_terminal_count`, `budget_exhausted` und eine grob gerundete Gesamtdauer. Nicht protokolliert und nicht in Responses aufgenommen werden Customer Text, gerenderter Text, Telefonnummer, externe Senderidentität, Provider Message ID, rohe Provider-Payload, rohe DB-Fehler, Stack Traces, Authorization Header oder Secrets. Command-/Message-IDs gehören nicht in Standardlogs oder Response.

Die autorisierte Response darf nur die genannten Aggregate und einen festen Status enthalten. Unauthorized-/Konfigurationsantworten sind leer oder enthalten ausschließlich einen festen generischen Fehlercode.

## 19. Security

- Route, Secret-Lesen und Service-Role-Client bleiben ausschließlich serverseitig; kein Export in Client-Bundles.
- Authentisierung findet vor Discovery und vor Erzeugung einer DB-Capability statt.
- `SUPABASE_SERVICE_ROLE_KEY` wird nur im serverseitigen Adapter genutzt; Scheduler und Request erhalten ihn nie.
- Supabase Vault schützt das Scheduler-Secret; es wird nicht als Cron-SQL-Literal, URL-Parameter oder Logfeld gespeichert.
- Die Recovery Route akzeptiert keine fachlichen IDs oder Batch-Parameter vom Aufrufer. Discovery liefert nur interne IDs und Lease-Zeit, keine Inhalte.
- Die Route besitzt keine direkte DB-Mutationslogik. RLS-/Grant- und Fencing-Grenzen aus AP-16-06-02 bleiben unverändert.
- Keine automatische Angebotsfreigabe, keine ungeprüfte KI-Persistenz und keine personenbezogenen Logs werden eingeführt.

## 20. Future OpenAI Runtime Re-evaluation

Die synchrone Immediate-Entscheidung und das 60-/45-Sekunden-Recoverybudget gelten ausdrücklich für den **aktuellen deterministischen Cycle ohne OpenAI**. Vor jeder OpenAI-/LLM-Integration müssen Function-Duration, Provider-Timeout, Abbruchsemantik, Lease/Heartbeat, Batch-Größe, Concurrency und die Trennung von Webhook-Acceptance erneut auditiert werden. Dieser Freeze autorisiert keine zukünftige Inference innerhalb des heutigen Zeitbudgets.

## 21. Explicitly Not Implemented

Dieses Paket implementiert ausdrücklich keine Runtime Route, kein Webhook Wiring, keine Scheduler-/Cron-Konfiguration, keine Extension-Aktivierung, keinen Vault-Eintrag, keine Environment Variable, keine Migration, keine Supabase Function, keine DB-Authority, keine Retry-Schleife, keine Queue, keinen Heartbeat, keine WhatsApp Delivery/Send-/Graph-API-Verbindung und keine OpenAI-/LLM-/Inference-Integration. Es ändert ausschließlich dieses Audit-Dokument.

Der Runner endet weiterhin nach persistentem Cycle Commit. WhatsApp Outbound Delivery ist ein separates Folgepaket.

## 22. AP-16-06-03 Implementation Contract

Der erneute AP-16-06-03-Versuch hat exakt folgenden Handoff:

**A. Webhook-Funktion:** `createWhatsAppWebhookHandlers(...).POST` in `lib/server/whatsapp/webhook.ts` behält `await triggerCycle(...)`, die `recorded && cycle_eligible`-Bedingung und die Transport-/Cycle-Fehlertrennung bei.

**B. Legacy Claim:** In `triggerPersistentMessageCycle(...)` in `lib/server/whatsapp/ingestion.ts` wird der direkte RPC `claim_customer_message_cycle` vollständig entfernt. Es gibt keinen Vor-Claim.

**C. Awaited Runner:** `triggerPersistentMessageCycle(...)` ruft genau einmal `await runPersistentCustomerMessageCycle(dependencies, { message_id })` mit zentralen serverseitigen Supabase-RPC-Dependencies auf. Alle geschlossenen Resultate werden kontrolliert behandelt und verändern nach erfolgreicher Inbound-Persistenz nicht Meta HTTP 200.

**D. Recovery Entry Point:** `POST /api/internal/conversation-cycles/recovery` in `app/api/internal/conversation-cycles/recovery/route.ts`; Auth zuerst, einmalige bounded Discovery, danach ausschließlich Runner-Aufrufe. Keine direkte Lease-/Knowledge-/Runtime-Mutation.

**E. Scheduler:** Supabase Cron (`pg_cron`) löst über `pg_net` per HTTPS den Vercel Entry Point aus; der Authorization-Wert wird aus Supabase Vault bezogen. Keine Supabase Edge Function und kein direkter SQL-Domain-Cycle.

**F. Frequenz:** `*/5 * * * *`, genau ein POST pro Tick.

**G. Auth Header:** `Authorization: Bearer <secret>`; kein Query-/Body-/Cookie-Secret.

**H. Environment Variable:** `CONVERSATION_CYCLE_RECOVERY_SECRET`; fehlend/leer führt vor Work zu 503, ungültiger Request zu 401. Digest plus `timingSafeEqual` ist Pflicht.

**I. Batch Size:** feste `10`, nicht requeststeuerbar, höchstens eine Discovery pro Run.

**J. Concurrency:** sequenziell, feste Concurrency 1; Startbudget 45 Sekunden, Gesamtbudget 60 Sekunden.

**K. Result Handling:** pro Command isoliert; `completed`, `human_review`, `failed`, `busy`, `stale`, `ownership_lost` werden aggregiert, `already_terminal` darf separat inhaltsarm gezählt werden. Exception zählt `failed`; kein Resultat erzeugt Route-Retry, direkten DB-Write oder Batch-Abbruch. Nach Budgetende übernimmt der nächste Tick.

**L. Zwingende Tests:**

1. Webhook ruft nur bei `recorded && cycle_eligible` genau einen awaited Runner auf; Duplikat und ineligible tun dies nicht.
2. Immediate Runner ersetzt den direkten Legacy-Claim; kein Vor-/Doppel-Claim, Fire-and-forget oder Outbound-Aufruf.
3. Erfolgreiche Inbound-Persistenz liefert trotz jeder Runner-Kategorie und Runner-Exception Meta HTTP 200; Persistenzfehler bleiben Transportfehler.
4. Recovery lehnt fehlendes Server-Secret mit 503 und fehlenden, mehrfachen, falsch formatierten oder falschen Header mit 401 ab, jeweils ohne Client-Erzeugung, Discovery und Runner.
5. Gültiger Bearer-Header wird über den festgelegten Digest-/Constant-Time-Vertrag akzeptiert; Query-/Body-Secret wird ignoriert.
6. Discovery wird genau einmal mit Limit 10 aufgerufen; keine direkten Tabellenreads oder Lease-Mutationen.
7. Höchstens zehn Results werden in stabiler Reihenfolge mit Concurrency 1 verarbeitet; keine zweite Discovery und keine interne Retry-Schleife.
8. Jede Runner-Kategorie wird korrekt aggregiert; eine per-command-Exception bricht den Rest nicht ab.
9. Fake-Timer-/Clock-Test beweist: nach 45 Sekunden startet kein weiterer Command; verbleibende Rows bleiben für den nächsten Tick.
10. Response und Logging enthalten nur erlaubte Aggregate und niemals IDs, Inhalte, rohe Fehler oder Secrets.
11. Statische Scheduler-Checks beweisen Fünf-Minuten-Ausdruck, HTTPS POST, Vault-Bezug und Authorization Header sowie das Fehlen eines Secret-Literals/Query-Secrets und eines Vercel Cron Jobs.
12. Bestehende Runner-, Data-Source-, Webhook- und Migrationssicherheitstests, vollständiges `vitest`, Typecheck und Lint bleiben grün.

Mit diesem Vertrag sind Immediate Trigger, Scheduler-Technologie, Frequenz, Entry Point, Authorization, Batch, Concurrency und Runtimebudget eindeutig festgelegt. AP-16-06-03 kann ohne erneute Scheduler-Mehrdeutigkeit implementiert werden.

**AUDIT RESULT: READY**
