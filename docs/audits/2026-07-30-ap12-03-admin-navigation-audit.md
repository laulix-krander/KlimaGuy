# AP-12-03 — Admin Navigation Architecture Audit

**Audit-ID:** `KG-AUDIT-2026-07-30-AP12-03-ADMIN-NAVIGATION-V1`  
**Datum:** 2026-07-30  
**Art:** ausschließlich Architektur- und Security-Audit; keine Implementierung

## 1. Baseline und Scope

- Der Arbeitsbaum war vor Beginn sauber: `git status --short --branch` lieferte ausschließlich `## work`.
- Baseline-Commit: `4d2fe301976d01f0cc7610339ed92a25ed3cb435`.
- Baseline-Betreff: `Merge pull request #64 from laulix-krander/codex/dokumentiere-ap-12-core-audit`.
- Es ist **kein Git-Remote konfiguriert**; `git remote -v` lieferte keine Ausgabe. Eine Veröffentlichung zu einem Remote ist aus dieser Arbeitskopie daher nicht möglich.
- Audit-Scope ist die vorhandene Navigation, ihre Layout- und Komponentenstruktur, die tatsächlich vorhandenen Rollen und Permissions sowie das Zielbild für eine spätere Admin-Navigation.
- Außerhalb des Scopes sind Implementierung, UI- oder Navigationsänderungen, Komponenten, Styles, Tests, Migrationen und Änderungen an `package.json`.

## 2. Ist-Architektur der Navigation

### 2.1 Layouts und Routing

| Ebene | Datei | Tatsächliche Aufgabe |
| --- | --- | --- |
| Root Layout | `app/layout.tsx` | Setzt `lang="de"`, bindet `app/globals.css` ein und rendert ausschließlich den Seiteninhalt. Es enthält keine Navigation und keine Rollenauflösung. |
| App Route Group Layout | `app/(app)/layout.tsx` | Rendert für alle Routen der Gruppe `(app)` zuerst `<Nav />` und danach den Inhalt in einem gemeinsamen `<main>`. Darunter liegen Dashboard, Kunden, Projekte und die vorhandene Adminroute. |
| Auth Route Group | `app/(auth)/login/page.tsx` | Liegt nicht unter dem `(app)`-Layout und erhält deshalb die gemeinsame App-Navigation nicht. |

Es gibt kein eigenes Layout unter `app/(app)/admin`, keine Admin-Shell und keine Sidebar. Der einzige vorhandene Adminpfad `app/(app)/admin/project-media/orphans/page.tsx` erbt unverändert das allgemeine `(app)`-Layout.

### 2.2 Verwendete Navigation und Erzeugung der Menüpunkte

Die einzige globale App-Navigation ist `Nav` in `components/ui.tsx`. Sie ist eine horizontale Kopfzeile und erzeugt ihre Einträge direkt als fest codierte `Link`-Elemente:

1. `KlimaGuy` → `/dashboard`
2. `Kunden` → `/customers`
3. `Projekte` → `/projects`
4. `Logout` als POST-Formular → `/auth/logout`

Es existieren weder eine Navigationskonfiguration noch ein Menü-Datenmodell, ein rollenabhängiger Mapper, eine Admin-Gruppe oder ein Link auf `/admin/project-media/orphans`. Menüpunkte werden nicht aus den vorhandenen Domain-Permissions abgeleitet.

Die einzige weitere Navigation im untersuchten Adminbereich ist die lokale Seitennavigation in `orphan-inventory-view.tsx`. Deren URLs werden durch `pageHref()` erzeugt; sie wechselt ausschließlich Seiten und Filter innerhalb von `/admin/project-media/orphans` und ist kein globales Menü.

### 2.3 Server- und Client-Components

- `app/layout.tsx`, `app/(app)/layout.tsx`, `components/ui.tsx`, die Admin-`page.tsx` und `orphan-inventory-view.tsx` besitzen keine `"use client"`-Direktive. In der vorhandenen Next.js-App-Router-Struktur sind sie damit Server Components beziehungsweise serverseitig nutzbare Komponenten.
- `Nav` liest aktuell weder Session noch Profil und nimmt keine Props entgegen. Die Navigation ist daher statisch und für Admin und Reviewer identisch.
- `orphan-claim-control.tsx` und `orphan-purge-control.tsx` sind ausdrücklich Client Components. Sie betreffen interaktive Adminaktionen, erzeugen aber keine globale Navigation.
- Die Adminseite lädt die Inventur serverseitig über `getProjectMediaOrphanInventory()`. Claim und Purge werden über Server Actions ausgeführt.

## 3. Tatsächlich vorhandene Bereiche und Rollen

Das Domainmodell kennt ausschließlich die Rollen `admin` und `reviewer` (`lib/domain/types.ts`); externe Rollenwerte werden mit `roleSchema` validiert (`lib/domain/schemas.ts`).

### 3.1 Ausschließlich Admin

- Der einzige als Adminroute organisierte Bereich ist `/admin/project-media/orphans` mit der UI „Medien-Inventur“.
- Der Inventur-Service authentifiziert den Benutzer, lädt dessen Profil, validiert die Rolle und prüft `canViewProjectMediaOrphanInventory()` **bevor** er Kandidaten lädt (`lib/actions/project-media-orphan-inventory-service.ts`). Die Permission erlaubt ausschließlich `admin`.
- Claim und Purge besitzen jeweils eigene Admin-Permissions (`canClaimProjectMediaOrphan()` und `canPurgeProjectMediaOrphan()`) und werden in den jeweiligen serverseitigen Services erneut autorisiert.
- Zusätzlich existieren admin-exklusive fachliche Fähigkeiten in Kunden- und Projektseiten, etwa Erstellen/Bearbeiten/Löschen, Human-Review, Zusammenfassung und Medienupload. Diese sind über einzelne Permissions geschützt, bilden aber keine eigenen globalen Navigationsbereiche.

### 3.2 Reviewer

- Es existiert keine reviewer-exklusive Route und kein reviewer-exklusiver Navigationspunkt.
- Reviewer dürfen nach den vorhandenen Domain-Permissions Projektstatus und Projektklasse ändern, Projektnotizen erstellen sowie eigene Notizen bearbeiten und soft-deleten. Diese Fähigkeiten befinden sich innerhalb des allgemeinen Projektbereichs.
- Reviewer dürfen die Medien-Inventur laut `canViewProjectMediaOrphanInventory()` nicht sehen. Aktuell gibt es zwar keinen sichtbaren Link dorthin, aber auch noch keine rollenabhängige Navigation.

### 3.3 Allgemeine Bereiche

- Die globale Navigation zeigt `Dashboard`, `Kunden` und `Projekte` ohne Rollenprüfung.
- Der Middleware-Authentifizierungsschutz umfasst ausdrücklich `/dashboard`, `/customers` und `/projects`. Diese Bereiche sind damit für authentifizierte Benutzer vorgesehen; einzelne schreibende Funktionen werden zusätzlich anhand der Rolle eingeschränkt.
- `/login` ist die Auth-Route. `/` leitet auf `/dashboard` weiter. Beides sind keine Einträge der App-Navigation.
- Der Präfix `/admin` ist aktuell **nicht** in `protectedPath` der Middleware enthalten. Die Inventurdaten werden dennoch durch die serverseitige Authentifizierung und Rollenprüfung des Inventur-Service geschützt. Dieser Befund ist wichtig für die spätere Navigation, darf aber nicht als Grund verstanden werden, auf die serverseitige Autorisierung zu verzichten.

## 4. Permission-Befund

### 4.1 Vorhandene Permission

`canViewProjectMediaOrphanInventory(role: Role): boolean` ist bereits in `lib/domain/permissions.ts` vorhanden und liefert ausschließlich für `role === "admin"` den Wert `true`. Der Inventur-Service verwendet genau diese Permission bereits für den serverseitigen Zugriff.

### 4.2 Wiederverwendung für den zukünftigen Link

Für den konkret empfohlenen Navigationspunkt **„Medien-Inventur“** kann und sollte `canViewProjectMediaOrphanInventory()` wiederverwendet werden. Damit bleibt die Sichtbarkeit des Links an dieselbe fachliche View-Permission gekoppelt wie der serverseitige Inventurzugriff. Die Rolle muss zuvor aus dem serverseitig geladenen Profil stammen und mit `roleSchema` validiert werden.

Diese Wiederverwendung ist eine Empfehlung für die spätere Implementierung, keine Änderung im Rahmen dieses Audits.

### 4.3 Keine allgemeine Admin-Navigation-Permission vorhanden

Es existiert aktuell weder `canViewAdminNavigation()` noch `canAccessAdministration()` oder eine vergleichbare allgemeine Permission. Die vorhandenen Permissions sind fähigkeits- beziehungsweise workflowbezogen. Allein aus einem `/admin`-Pfad oder aus dem Rollennamen darf deshalb keine bereits vorhandene allgemeine Navigations-Permission abgeleitet werden.

Für den ersten einzelnen Eintrag ist keine neue allgemeine Permission nachgewiesen erforderlich. Sobald mehrere Adminziele existieren, muss separat entschieden werden, ob die Gruppe „Administration“ sichtbar ist, wenn mindestens eine ihrer konkreten Ziel-Permissions erfüllt ist, oder ob eine eigene Gruppen-Permission fachlich notwendig wird.

## 5. Zielbild für eine spätere Admin-Navigation

> Dieses Zielbild ist ausschließlich eine Empfehlung und wird in diesem Audit nicht implementiert.

Die allgemeine Navigation soll um einen klar abgegrenzten, erweiterbaren Bereich am Ende der Navigation ergänzt werden:

```text
Administration
└── Medien-Inventur
```

Spätere, noch nicht vorhandene Erweiterungen können darunter eingeordnet werden:

```text
Administration
├── Medien-Inventur
├── Audit Log
├── Storage
├── Benutzer
└── System
```

Dabei gilt:

- Zunächst darf nur der tatsächlich vorhandene Zielpunkt „Medien-Inventur“ verlinkt werden.
- Die später genannten Punkte sind Informationsarchitektur, keine Aussage über vorhandene Routen, Permissions oder Implementierungsreife.
- Jeder spätere Eintrag benötigt eine eigene, fachlich passende Berechtigungsprüfung. Die Sichtbarkeit der Gruppe sollte aus den sichtbaren, autorisierten Kindzielen ableitbar bleiben, sofern keine eigenständige Gruppen-Permission beschlossen wird.
- Das Zielbild soll den modularen Monolithen beibehalten; eine Navigation rechtfertigt weder einen eigenen Service noch eine separate Anwendung.

## 6. Security-Anforderungen

1. **Ein Link ist keine Autorisierung.** Das Ausblenden der Navigation reduziert nur die Auffindbarkeit und ersetzt niemals serverseitige Zugriffskontrolle.
2. **Reviewer sehen den Link nicht.** Der Punkt „Medien-Inventur“ darf nur nach serverseitig ermittelter, validierter Rolle und erfolgreicher `canViewProjectMediaOrphanInventory()`-Prüfung gerendert werden.
3. **Direkte URL-Aufrufe bleiben serverseitig blockiert.** `getProjectMediaOrphanInventoryWithDataSource()` prüft bereits Authentifizierung, Profil, Rollenschema und Permission. Diese Prüfung muss unabhängig von der Navigation erhalten bleiben.
4. **Keine Client-only Security.** Rollen- oder Permissionentscheidungen dürfen nicht ausschließlich in einer Client Component, anhand von Clientzustand oder durch CSS erfolgen. Es dürfen keine Secrets in Clientcode gelangen.
5. **Mutation bleibt separat geschützt.** Die Sichtbarkeit des Inventur-Links oder der Seite darf Claim/Purge nicht implizit erlauben; deren vorhandene Server-Action- und Service-Permissions bleiben erforderlich.
6. **Middleware ist keine vollständige Fachautorisierung.** Der aktuelle fehlende `/admin`-Eintrag in `protectedPath` sollte bei der Implementierungsplanung bewusst bewertet werden. Selbst bei einer späteren Middleware-Erweiterung bleibt die serverseitige Rollenprüfung die maßgebliche Zugriffskontrolle.
7. **Fail closed.** Fehlende Session, fehlendes Profil oder ungültige Rolle dürfen weder Adminlink noch Inventurdaten freigeben.

## 7. UX-Empfehlungen

Diese Punkte sind Empfehlungen, keine Implementierungsentscheidungen:

- Den Bereich „Administration“ am Ende der primären Navigation positionieren und visuell klar von den allgemeinen Zielen trennen.
- Ein verständliches Icon nur unterstützend einsetzen; der Text „Administration“ beziehungsweise „Medien-Inventur“ muss die Bedeutung allein vermitteln.
- Die Navigation nicht mit zukünftigen, noch funktionslosen Einträgen überladen.
- Die Struktur so modellieren, dass weitere autorisierte Adminziele ergänzt werden können, ohne die globale Navigation erneut grundlegend umzubauen.
- Desktop und Mobile müssen dieselben erlaubten Ziele zugänglich machen; die konkrete Darstellung darf sich responsiv unterscheiden.
- Touch-Ziele, Fokusführung, Tastaturbedienung, semantische Navigation und verständliche zugängliche Namen berücksichtigen.
- Bei nur einem Adminziel keine unnötig tiefe Interaktion erzwingen; zugleich die spätere Gruppierung konzeptionell ermöglichen.

## 8. Offene Entscheidungen

Für AP-12-03-01 sind folgende Fragen ausdrücklich offen. Dieses Audit trifft dazu keine Entscheidung:

1. Soll „Administration“ einklappbar sein oder bei nur einem Ziel direkt angezeigt werden?
2. Soll der Bereich ein eigenes Icon erhalten, und wenn ja, welches Icon-System soll verwendet werden?
3. Ist ein Badge fachlich sinnvoll; welcher belastbare Status würde darin dargestellt und serverseitig ermittelt?
4. Sollen Desktop und Mobile strukturell und visuell identisch sein oder nur dieselben autorisierten Ziele anbieten?
5. Ist für `/admin/project-media/orphans` ein Breadcrumb sinnvoll, insbesondere mit Blick auf weitere Admin-Unterbereiche?
6. Soll eine künftige Admin-Gruppe über die Summe konkreter Kind-Permissions sichtbar werden oder eine eigene allgemeine Permission erhalten?
7. Soll `/admin` zusätzlich in den Auth-Scope der Middleware aufgenommen werden, und welche serverseitige Guard-Struktur soll Adminrouten gemeinsam absichern?

## 9. Audit-Ergebnis

Die Anwendung besitzt derzeit eine einzige statische, horizontale Navigation ohne Rollenauflösung und ohne Adminlink. Die Medien-Inventur ist die einzige vorhandene Adminroute. Für ihren zukünftigen Link existiert mit `canViewProjectMediaOrphanInventory()` bereits eine passende, konkrete Permission; eine allgemeine Admin-Navigation-Permission existiert nicht. Die vorhandene serverseitige Autorisierung des Inventur-Service muss bestehen bleiben und darf durch die Navigation weder ersetzt noch abgeschwächt werden.

**Status:** `READY FOR IMPLEMENTATION`  
**Nächster Schritt:** `AP-12-03-01 — Admin Navigation Implementation`

