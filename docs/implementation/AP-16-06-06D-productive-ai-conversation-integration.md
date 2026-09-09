# AP-16-06-06D — Productive AI Conversation Integration

## Ergebnis

Die providerneutrale Customer-Answer-Klassifikation ist am bestehenden persistenten Conversation Cycle produktiv angebunden. Das serverseitige Feature Gate `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED` aktiviert sie ausschließlich beim exakten Wert `true`. Bei deaktiviertem Gate wird kein Provider konstruiert und der deterministische Bestandspfad bleibt unverändert.

Nach Normalisierung werden nur gebundene, aktive, nicht bereits exakt erkannte Textantworten mit einer registrierten Canonical-Allowlist zugelassen. Vor jedem Provider Request reserviert die Datenbank einen der höchstens drei autorisierten Attempts. Ein `matched`-Vorschlag wird erneut gegen die aktive Registry geprüft und ausschließlich als enger Canonical Override an die deterministische Interpretation gereicht; Claim, Evidence, Transition und Knowledge Apply bleiben dort autoritativ.

`no_match` und `ambiguous` durchlaufen den claimlosen Planner-/Renderer-Pfad und den atomaren `no_claim`-Commit. Sie erzeugen weder Claim noch Evidence oder Knowledge-Version. Timeout und transiente Providerfehler werden bei Attempt eins und zwei an die bestehende Recovery delegiert und nach Attempt drei als `ai_attempts_exhausted` technisch eskaliert. Konfigurationsfehler eskalieren sofort als `ai_configuration_failure`; alle nicht transienten Fehler als `ai_non_transient_failure`.

Der OpenAI Adapter bleibt ausschließlich im produktiven serverseitigen Composition Root hinter dem neutralen Port. Er wird lazy geladen und pro Runtime wiederverwendet. Planner, Renderer, Persistence, Delivery, Pricing, Offer Authority und Human Review übernehmen keine AI-Ausgabe als eigene Authority.
