-- AP-16-04-01 provider-independent persistence only. The Meta contract gate was
-- unavailable, therefore this migration deliberately exposes no webhook/parser RPC.
create type public.conversation_transport_provider as enum ('whatsapp');
create type public.conversation_transport_identity_status as enum ('active','blocked');
create type public.conversation_transport_binding_status as enum ('active','superseded');
create type public.transport_webhook_processing_status as enum ('received','processing','processed','unsupported','failed');
create type public.transport_message_direction as enum ('inbound');

create table public.conversation_transport_identities (
 id uuid primary key default gen_random_uuid(),
 provider public.conversation_transport_provider not null,
 sender_scope text not null check (length(sender_scope) between 1 and 255),
 external_identity text not null check (length(external_identity) between 1 and 255),
 customer_id uuid references public.customers(id) on delete restrict,
 status public.conversation_transport_identity_status not null default 'active',
 created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(),
 unique(provider,sender_scope,external_identity)
);

create trigger conversation_transport_identity_updated_at
before update on public.conversation_transport_identities for each row
execute function public.set_updated_at();

create table public.conversation_transport_bindings (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 transport_identity_id uuid not null references public.conversation_transport_identities(id) on delete restrict,
 provider public.conversation_transport_provider not null,
 status public.conversation_transport_binding_status not null default 'active',
 revision integer not null default 1 check (revision > 0),
 created_at timestamptz not null default statement_timestamp(),
 superseded_at timestamptz,
 check ((status='active' and superseded_at is null) or (status='superseded' and superseded_at is not null))
);
create unique index one_active_transport_binding_per_identity
on public.conversation_transport_bindings(transport_identity_id) where status='active';

create table public.transport_webhook_receipts (
 id uuid primary key default gen_random_uuid(),
 provider public.conversation_transport_provider not null,
 sender_scope text not null check (length(sender_scope) between 1 and 255),
 provider_event_identity text not null check (length(provider_event_identity) between 1 and 512),
 event_kind text not null check (length(event_kind) between 1 and 64),
 received_at timestamptz not null default statement_timestamp(),
 processing_status public.transport_webhook_processing_status not null default 'received',
 internal_message_id uuid references public.conversation_messages(id) on delete restrict,
 failure_code text,
 unique(provider,sender_scope,provider_event_identity)
);

create table public.transport_message_bindings (
 id uuid primary key default gen_random_uuid(),
 provider public.conversation_transport_provider not null,
 sender_scope text not null check (length(sender_scope) between 1 and 255),
 provider_message_id text not null check (length(provider_message_id) between 1 and 512),
 internal_message_id uuid not null unique references public.conversation_messages(id) on delete restrict,
 transport_identity_id uuid not null references public.conversation_transport_identities(id) on delete restrict,
 direction public.transport_message_direction not null default 'inbound',
 provider_occurred_at timestamptz not null,
 created_at timestamptz not null default statement_timestamp(),
 unique(provider,sender_scope,provider_message_id)
);

alter table public.conversation_transport_identities enable row level security;
alter table public.conversation_transport_bindings enable row level security;
alter table public.transport_webhook_receipts enable row level security;
alter table public.transport_message_bindings enable row level security;

revoke all on public.conversation_transport_identities,public.conversation_transport_bindings,
 public.transport_webhook_receipts,public.transport_message_bindings from public,anon,authenticated;

comment on table public.conversation_transport_identities is 'PII transport authority. No browser access; external identities must never enter audit, runtime, knowledge, or normal conversation DTOs.';
comment on table public.transport_webhook_receipts is 'Minimal live receipt authority; raw webhook payloads and message text are prohibited.';
comment on table public.transport_message_bindings is 'Provider IDs remain separate from internal conversation message identity.';
