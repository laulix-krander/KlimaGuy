# Projektmedien kurz validieren

## A. Supabase

1. Den Supabase SQL Editor öffnen.
2. Den Inhalt von `scripts/validate-project-media-production.sql` einfügen.
3. **Run** anklicken.
4. Prüfen, dass kein `FAIL` vorhanden ist.
5. `WARN`-Einträge anhand der jeweils genannten Restprüfung prüfen.

## B. Repository

```bash
bash scripts/validate-project-media-repository.sh
```

## C. Browser

1. Als Admin eine kleine gültige PNG-Datei hochladen und die Erfolgsmeldung prüfen.
2. Als Reviewer prüfen, dass das Uploadformular nicht angezeigt wird.

Die vorhandenen automatisierten Tests decken die Negativfälle ab.

## D. Ergebnis

| Feld | Eintrag |
|---|---|
| Datum | |
| Umgebung | |
| SQL PASS/FAIL/WARN | |
| Repository PASS/FAIL | |
| Admin-Upload PASS/FAIL | |
| Reviewer-Sichtbarkeit PASS/FAIL | |
| offene WARNs | |
