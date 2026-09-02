# AP-16-06-03 – Productive Runtime Trigger & Recovery Scheduling

**Baseline:** `53c05a6301ed2ed78af938d9df0a5b1246309f78`  
**Status:** STOP – keine Produktimplementierung

## 1. Architecture Basis

Vollständig geprüft wurden AP-16-06-00, AP-16-06-01A sowie die Implementierungen AP-16-06-01B, C, D, DE, E, F und AP-16-06-02. Maßgeblich ist der aktuelle Code. AP-16-06-02 stellt mit `runPersistentCustomerMessageCycle(...)` den serverseitigen Runner und mit `discoverRecoverableConversationCycles(...)` die begrenzte Recovery-Discovery bereit. Acquire/Reclaim, fünfminütige Lease und Fencing liegen bereits in der Datenbank- und Data-Source-Authority.

Der aktuelle WhatsApp-Pfad persistiert zuerst mit `persistWhatsAppInboundText(...)`. Nur bei `status === "recorded"` und `cycle_eligible === true` wird `triggerPersistentMessageCycle(...)` mit der internen `message_id` awaited. Dieser Legacy-Trigger ruft derzeit ausschließlich `claim_customer_message_cycle(...)` auf. Der Webhook fängt einen nachgelagerten Triggerfehler ab und bestätigt die bereits erfolgreiche Transportpersistenz weiterhin mit HTTP 200.

## 2. Scope

Dieses Dokument hält den verpflichtenden Pre-Implementation-Check und die eingetretene STOP-Bedingung fest. Es wurden keine Runtime-Datei, Route, Scheduler-Konfiguration, Environment-Variable, Migration oder Tests verändert. Insbesondere wurde der Legacy-Claim nicht teilweise ersetzt: So bleibt bis zur Klärung eine einzige, wenn auch noch unvollständige produktive Claim-Grenze bestehen.

## 3. Immediate Trigger

Der vorgesehene kleinste Anschluss ist eindeutig ableitbar: `triggerPersistentMessageCycle(...)` muss den bestehenden Runner genau einmal und ausschließlich mit `{ message_id }` aufrufen. Dazu kann ein zentral erzeugter serverseitiger Supabase-Service-Role-Client als `claim`, `read` und `commit` an den Runner übergeben werden. Der Runner erstellt über `createPersistentCycleDataSource(...)` einen Execution Context; dessen Claim-Methode verwendet dann atomar `acquire_customer_message_cycle_execution(...)`.

Der bisherige direkte Aufruf von `claim_customer_message_cycle(...)` muss bei dieser Umstellung vollständig entfallen. Ein Vor-Claim plus Runner wäre doppeltes Claiming und ist ausgeschlossen.

## 4. Webhook Transport vs Cycle Execution Boundary

Der bestehende Handler awaited den Trigger bereits. Damit wäre eine synchrone Integration ohne Fire-and-forget technisch formulierbar. Nach erfolgreicher Inbound-Persistenz werden kontrollierte Runner-Ergebnisse nicht Teil der Meta-Antwort; ein technisches Runner-Ergebnis darf die erfolgreiche Transportannahme nicht zurückrollen oder Meta zum fachlichen Retry-Mechanismus machen.

Das Repository enthält allerdings weder ein dokumentiertes Function-Duration-Budget noch eine live verifizierte Deployment-/Plan-Konfiguration. Weil bereits die Recovery-Scheduling-Grenze zwingend blockiert, wurde keine isolierte Immediate-Teilimplementierung vorgenommen. So entsteht kein halb produktiver Zustand ohne den geforderten unabhängigen Recovery Trigger.

## 5. Duplicate Handling

Die vorhandene Deduplizierung bleibt die Authority: `duplicate` beziehungsweise `cycle_eligible === false` darf keinen Immediate Runner starten. Recovery darf ausschließlich über die AP-16-06-02-Discovery erfolgen und ist nicht von einem erneuten Meta-Webhook abhängig.

## 6. Runner Result Handling

Die geschlossenen Kategorien `completed`, `human_review`, `already_terminal`, `failed`, `stale`, `busy` und `ownership_lost` sind intern zu zählen beziehungsweise kontrolliert zu behandeln. Keine Kategorie begründet einen zweiten Runner-Aufruf, eine zweite Failure-Persistenz oder eine Mutation im Trigger. `busy`, `already_terminal`, `ownership_lost`, `stale`, `failed` und `human_review` sind insbesondere kein Grund, die bereits persistierte Meta-Nachricht als Transportfehler zu beantworten. Domain-, Customer-, Knowledge-, Snapshot- oder Message-Inhalte dürfen nie in die HTTP-Antwort gelangen.

## 7. Recovery Discovery

Die einzige zulässige Discovery ist `discoverRecoverableConversationCycles(...)`. Sie kapselt `discover_recoverable_conversation_cycles(...)`, begrenzt Resultate auf höchstens 100 und liefert die persistierte interne `source_message_id`. Eine Route darf weder direkt gegen `conversation_cycle_commands` lesen noch Lease-Ablauf in TypeScript nachbilden.

## 8. Recovery Execution

Ein späterer Recovery Entry Point soll einen konservativen, festen Batch einmalig entdecken und die gefundenen `source_message_id`-Werte jeweils dem bestehenden Runner übergeben. Pro Command ist das Resultat isoliert zu behandeln, damit ein Fehler den restlichen bounded Batch nicht verhindert. Es gibt keine Schleife, keinen direkten Reclaim und keine Lease-Mutation im Entry Point; Acquire/Reclaim und Fencing bleiben beim Runner.

## 9. Recovery Scheduling

Das Repository beschreibt lediglich ein Vercel-Deployment mit Next.js-Standardbuild. Es enthält kein `vercel.json`, keine Cron-Konfiguration, keinen anderen Scheduler, keine Workflow-Konfiguration und keine Angabe zum tatsächlich verwendeten Vercel-Plan. Damit ist weder belegt, dass Vercel Cron für dieses Deployment aktiviert ist, noch dass der konkrete Plan einen Lauf alle fünf Minuten zulässt. Aus Repository und verfügbarer Umgebung kann die tatsächlich verfügbare Scheduling-Frequenz nicht sicher bestimmt werden.

Das ist STOP-Bedingung 4 des Pakets und zugleich die explizite Grenze aus Abschnitt 26: Die gewünschte Fünf-Minuten-Frequenz darf ohne Plattform-/Plan-Nachweis nicht erfunden werden. Deshalb wurden weder `vercel.json` noch eine Recovery Route angelegt.

## 10. Recovery Security

Es existiert kein bestehendes internes oder Scheduled-Route-Security-Pattern. Ein späterer Vercel-Cron-Entry-Point kann fail closed über einen serverseitigen Authorization-Contract abgesichert werden, aber erst nachdem das tatsächliche Deployment-Modell bestätigt ist. Der passende Secret-Name und dessen Plattformzuführung dürfen nicht vorweggenommen werden. Es wurde kein Secret erzeugt, geloggt, exponiert oder zum Environment Contract hinzugefügt.

## 11. Bounded Work / Runtime Safety

AP-16-06-02 setzt nur die Discovery-Obergrenze 100; es definiert kein produktives Batch-Budget für die konkrete Function Runtime. Ohne verifizierten Vercel-Plan und dessen Function-Duration-Konfiguration kann weder eine belastbare Batch-Größe noch eine sichere Gesamtzeit festgelegt werden. Der Folgepfad muss nach Planverifikation eine konservative feste Größe wählen, ohne unbounded Loop, In-Memory Queue, `setTimeout`, `setInterval` oder unawaited Work.

## 12. Lease/Fencing Preservation

Es ist keine neue Claim-, Lease-, Retry- oder Reclaim-Semantik erforderlich. Der spätere Immediate- und Recovery-Trigger müssen direkt `runPersistentCustomerMessageCycle(...)` verwenden. Nur dessen leasegebundene Data Source darf `acquire_customer_message_cycle_execution(...)` aufrufen. Recovery mutiert keine Lease; Success, Failure und Human Review bleiben durch den AP-16-06-02-Owner gefenced.

## 13. Observability

Es wurde keine Logging-Plattform ergänzt. Ein Folgepaket darf ausschließlich inhaltsarme Trigger-/Result-Kategorien und Batch-Zähler erfassen. Customer Text, Telefonnummern, Provider-Payloads, gerenderte Antworten, rohe Datenbankfehler und Secrets bleiben ausgeschlossen.

## 14. Tests

Da die vorgeschriebene STOP-Bedingung vor Implementierung eintrat, wurden keine AP-16-06-03-Produktions- oder Scheintests hinzugefügt. Die vorhandenen Webhook- und Runner-Tests wurden als Baseline geprüft: 17 fokussierte Tests und die vollständige Suite mit 988 Tests waren erfolgreich; Typecheck, Lint und Diff-Check waren ebenfalls erfolgreich. Die im Paket geforderten Immediate-, Recovery-, Security-, Scheduling- und Boundary-Tests gehören in das unten beschriebene Folgepaket, sobald die Plattformgrenze autoritativ feststeht.

## 15. Explicitly Not Implemented

Nicht implementiert wurden Immediate Runner Wiring, Recovery Route, Scheduler, Cron-Secret, neue DB-Authority, Migration, Retry Policy, Fire-and-forget, Queue, WhatsApp Delivery/Send, Graph API, OpenAI/LLM/Inference, Replanning, Re-Rendering oder direkte Knowledge-/Runtime-Mutation.

## 16. Handoff to WhatsApp Delivery Bridge

Vor einem WhatsApp Delivery Bridge ist das kleinstmögliche Folgepaket **AP-16-06-03A – Deployment Runtime & Scheduler Contract Freeze** erforderlich. Es muss den tatsächlich verwendeten Vercel-Plan beziehungsweise das autoritative Deployment-Modell, die verfügbare Cron-Minimalfrequenz, das Function-Duration-Budget, den fail-closed Scheduler-Authorization-Contract und eine daraus abgeleitete konservative Batch-Größe verbindlich bestätigen. Danach kann AP-16-06-03 ohne neue DB-Authority vollständig umgesetzt werden. Erst anschließend darf ein separates Paket die bereits intern persistierte Outbound Message an die bestehende WhatsApp Delivery Authority anbinden.
