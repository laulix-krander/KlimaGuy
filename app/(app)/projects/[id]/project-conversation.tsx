import { formatBusinessDateTime } from "@/lib/domain/business-time";
import type { ConversationWorkspace } from "@/lib/domain/project-operations-read-model";
import React from "react";

const STATUS = { open: "Offen", paused: "Pausiert", human_review: "Human Review", closed: "Geschlossen" } as const;

export function ProjectConversation({ conversations }: { conversations: readonly ConversationWorkspace[] }) {
  return <section aria-labelledby="conversation-title" className="space-y-5" id="conversation">
    <div><h2 className="text-xl font-semibold" id="conversation-title">Conversation</h2><p className="text-sm text-slate-600">Kanonischer WhatsApp-Verlauf, getrennt nach Conversation-Grenzen.</p></div>
    {conversations.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-sm text-slate-600">Für dieses Projekt ist noch keine Conversation vorhanden.</div> : conversations.map((conversation, index) => <article className={conversation.historical ? "rounded-xl border bg-slate-50 p-5" : "rounded-xl border border-teal-200 bg-teal-50/40 p-5"} key={conversation.conversation_id}>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b pb-3"><h3 className="font-semibold">Conversation #{conversations.length - index}{conversation.historical ? " · Historisch" : " · Aktuell"}</h3><span className="text-sm text-slate-600">{STATUS[conversation.status]} · seit {formatBusinessDateTime(conversation.created_at)} Uhr</span></header>
      {conversation.messages.length === 0 ? <p className="text-sm text-slate-600">Noch keine Nachrichten in dieser Conversation.</p> : <ol aria-label={`Nachrichten in Conversation ${conversations.length - index}`} className="space-y-3">{conversation.messages.map((message) => <li className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`} key={message.message_id}><div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm md:max-w-[70%] ${message.direction === "inbound" ? "rounded-bl-sm bg-white" : message.direction === "outbound" ? "rounded-br-sm bg-teal-700 text-white" : "border border-amber-200 bg-amber-50"}`}>
        <div className={`mb-1 text-xs font-semibold ${message.direction === "outbound" ? "text-teal-50" : "text-slate-600"}`}>{message.speaker}</div>
        {message.content.type === "text" ? <p className="whitespace-pre-wrap break-words text-sm">{message.content.text}</p> : message.mediaUrl ? <a aria-label="Bild im Fotobereich öffnen" href="#medien"><img alt="Bild aus der Conversation" className="max-h-56 rounded-lg object-cover" src={message.mediaUrl} /></a> : <p className="text-sm italic">Anhang ist sicher gespeichert, aber aktuell nicht als Vorschau verfügbar.</p>}
        <time className={`mt-2 block text-right text-xs ${message.direction === "outbound" ? "text-teal-100" : "text-slate-500"}`} dateTime={message.occurred_at}>{formatBusinessDateTime(message.occurred_at)} Uhr</time>
      </div></li>)}</ol>}
    </article>)}
  </section>;
}
