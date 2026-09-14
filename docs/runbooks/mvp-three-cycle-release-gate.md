# MVP-Dreizyklus-Release-Gate

Dieses Runbook ist die kurze operative Abnahme für **drei aufeinanderfolgende reale WhatsApp-Zyklen**. Der automatisierte Teil beweist die vorhandenen Lifecycle-, Dedupe-, Turn-, Media-/Vision- und Offer-Grenzen; er ersetzt nicht den Live-Nachweis gegen Meta, OpenAI, Storage und die deployte Datenbank.

## Voraussetzungen

- Deployter Stand dieses Commits mit aktivierter MVP-Testidentität und funktionsfähigem Admin-Login.
- Meta-Webhook, Graph-Media-Zugriff, privater `project-media`-Bucket, OpenAI und Delivery-Worker sind für die Testumgebung konfiguriert.
- Eine bekannte WhatsApp-Testidentität; Telefonnummer, Nachrichtentexte, Bildinhalt, Tokens und Secrets werden **nicht** in die Evidenz übernommen.
- Eine leere, ausschließlich für Tests bestimmte PostgreSQL-Datenbank für den Repository-Gate. Dann ausführen:

  ```bash
  MVP_RELEASE_GATE_DATABASE_URL='postgresql://…' npm run test:mvp-release-gate
  ```

Der Befehl migriert die angegebene Testdatenbank neu. Niemals auf Production oder eine Datenbank mit erhaltenswürdigen Daten zeigen lassen.

## Evidenz ohne personenbezogene Daten

Vor Zyklus 1 einen Evidence-Eintrag anlegen. Pro Zyklus ausschließlich UUIDs, Revisionen, Zustände, Counts, Zeitpunkte und Provider-Aufruf-Counts erfassen:

| Nachweis | Zyklus 1 | Zyklus 2 | Zyklus 3 |
|---|---|---|---|
| pseudonymisierte stabile Identity-ID | | | |
| neue wamid (nur gehasht/gekürzt) | | | |
| Conversation-ID / Project-ID | | | |
| Binding-ID / Revision / `engine_owner=mvp` | | | |
| Inbound / Turn / Outbound / Delivery jeweils Count 1 | | | |
| Project-Fact-Keys und Qualification-State | | | |
| Image-Message / Media-ID / Project-ID / `ready` | | | |
| Vision-Turn-ID und ausschließlich aktuelle Media-IDs | | | |
| Project-Status / `requires_human_review=true` | | | |
| automatische Offer-/Preis-/Send-Counts jeweils 0 | | | |
| Admin-Draft-Aktion autorisiert | | | |
| Reset: alte Conversation `closed`, Historie erhalten | | | |

Die Prüfung darf deployte Logs und **nur lesende** Datenbank-/Dashboard-Ansichten verwenden. Keine Message-Bodies, Telefonnummern, Bilder, URLs oder Zugangsdaten kopieren.

## Zyklus 1

1. In der vorhandenen Admin-Testkunden-Reset-Seite Preview und anschließend Commit ausführen. Ein bereits geschlossener Lifecycle ist ein idempotenter Erfolg. Keine Zeilen löschen oder ändern.
2. Vom selben Testgerät eine neue Textnachricht mit neuer Provider-Identität senden. Neue offene Conversation, neues Project, nächste Binding-Revision und `engine_owner=mvp` erfassen.
3. Natürliche deutsche Antwort sowie genau je eine Inbound-Message, einen AI-Turn, eine Outbound-Message und einen Delivery-Command nachweisen. Weitere neue Textnachrichten senden, bis kanonische Project Facts aufgebaut sind.
4. Ein echtes Bild als neue WhatsApp-Nachricht senden. Meta-Download, privaten Storage-Pfad, eine `ready`-Media-Zeile mit Source-Message/Conversation/current Project und den Vision-Turn nachweisen. Der Vision-Input darf nur Media-IDs dieses Projects enthalten.
5. Qualifikation vervollständigen oder einen echten Needs-Human-Fall dokumentieren. Bei serverseitiger Readiness muss das Project `technical_review` erreichen und `requires_human_review` wahr bleiben.
6. Prüfen, dass weder Preis noch Offer-Draft/-Freigabe/-Send automatisch entstand. Als autorisierter Mensch die vorhandene Draft-Aktion öffnen bzw. kontrolliert ausführen und deren Audit-Eintrag erfassen.
7. Eine bereits verarbeitete Text-**und** Bild-wamid erneut zustellen. Vorher/Nachher-Counts müssen identisch bleiben: kein zweiter Download, Turn, Vision-Aufruf, Reply, Delivery-Command oder Handoff.
8. Über die Admin-Seite logisch resetten. Alte Conversation bleibt geschlossen; Project, Messages, Facts, Media, Turns, Delivery und Receipts bleiben historische Datensätze.

## Zyklen 2 und 3

Den vollständigen Ablauf aus Zyklus 1 jeweils mit **neuen** Text- und Bild-wamids wiederholen. Zusätzlich vor dem ersten AI- und Vision-Aufruf nachweisen:

- aktive Binding-Revision ist jeweils exakt um eins gestiegen und zeigt nur auf die neue Conversation; deren `current_project_id` zeigt nur auf das neue Project;
- Transcript-/Fact-/Media-IDs aller früheren Zyklen fehlen im aktuellen Context;
- Replay einer früheren wamid bleibt Duplicate/No-op;
- geschlossene Turns können nicht ins neue Project committen und alte Delivery-Arbeit initiiert keinen neuen Provider-Send;
- frühere Project-/Media-Zeilen sind unverändert und bleiben ihrem ursprünglichen Project zugeordnet.

Nach Zyklus 3 ebenfalls logisch resetten.

## PASS, FAIL und Neustartregel

**PASS** gilt nur, wenn der Repository-Befehl erfolgreich war und drei vollständige, direkt aufeinanderfolgende Live-Zyklen alle Tabellenpunkte erfüllen — ohne manuelle SQL-Mutation. Provider-Credentials oder ein nicht erreichbarer externer Dienst sind eine **Umgebungs-/Provider-Blockade**, kein Produkt-PASS und nicht automatisch ein Produktfehler.

**FAIL** ist jede Abweichung des Produktverhaltens: State-Leak, Duplicate-Side-Effect, falsche Project-/Media-Bindung, stale Commit/Send, mehr als ein Turn/Reply oder automatisches Pricing/Offer/Approval/Send. Externe HTTP-/Credential-/Quota-Ausfälle getrennt mit Zeitpunkt und nicht-sensitivem Fehlercode festhalten.

Bei einem Produkt-Fail den exakten Pfad bestimmen und nur den konkreten Bug beheben. Danach beginnt die Zählung wieder bei Zyklus 1. Ein Runbook-/Beobachtungsfehler wird korrigiert und der betroffene Nachweis wiederholt; ein Provider-Ausfall wird nach Wiederherstellung neu gestartet.

## Niemals manuell verändern

Keine Conversations, Bindings, Projects, Facts, Media, Receipts, Messages, Turns oder Delivery-Datensätze löschen, verschieben oder editieren; keine Statuswerte per SQL setzen; keine Migration nachpatchen. Reset erfolgt ausschließlich über die unterstützte Admin-Aktion. Inspektion bleibt read-only.
