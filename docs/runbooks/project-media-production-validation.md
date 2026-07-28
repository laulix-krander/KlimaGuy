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

## Read-only Diagnose möglicher pending-Orphans

Frühere fehlgeschlagene Uploadversuche können `pending`-Reservierungen hinterlassen haben. Die folgende Diagnose verändert keine Daten und gibt bewusst keine Originaldateinamen oder Storagepfade aus:

```sql
select count(*) over () as pending_count,
       project_id,
       created_at,
       now() - created_at as age
from public.project_media
where upload_status = 'pending'
  and deleted_at is null
order by created_at asc;
```

Keine Zeile aus dieser Diagnose darf automatisiert gelöscht oder in personenbezogene Logs übernommen werden.
