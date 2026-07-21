export const roles = ["admin", "reviewer"] as const;
export type Role = (typeof roles)[number];
export const projectStatuses = ["new", "collecting_information", "technical_review", "quote_draft", "human_review", "quote_sent", "accepted", "rejected", "closed"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const projectClasses = ["A", "B", "C", "D"] as const;
export type ProjectClass = (typeof projectClasses)[number];
export const statusLabels: Record<ProjectStatus, string> = { new: "Neu", collecting_information: "Infosammlung", technical_review: "Technische Prüfung", quote_draft: "Angebotsentwurf", human_review: "Menschliche Prüfung", quote_sent: "Angebot gesendet", accepted: "Angenommen", rejected: "Abgelehnt", closed: "Geschlossen" };
