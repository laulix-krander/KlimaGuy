# Sicherheit

Secrets werden ausschließlich über Environment-Variablen verwaltet. Public Supabase URL und Anon Key dürfen im Client liegen; Service Role Keys bleiben serverseitig und werden aktuell nicht genutzt.

Personenbezogene Daten dürfen nicht in Logs oder Audit-Metadaten geschrieben werden. Fachliche Zugriffe laufen über RLS. Rollen sind `admin` und `reviewer`: Admins verwalten Stammdaten, Reviewer lesen, ändern Projektstatus und bearbeiten Notizen.

Dateien und Bilder werden später in Supabase Storage mit privaten Buckets und projektbezogenen Policies abgelegt. Löschkonzepte müssen Soft Delete, Aufbewahrungsfristen und spätere Hard-Delete-Jobs trennen.

Auditierbarkeit erfolgt über `audit_log`; der Client darf diese Tabelle nicht direkt bearbeiten. Angebotsfreigaben und Preisentscheidungen müssen nachvollziehbar und menschlich geprüft bleiben.
