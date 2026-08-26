-- AP-16-05-01 provider-independent media authority. Meta lookup/download is
-- deliberately absent because the mandatory official-contract gate was blocked.
create type public.transport_media_ingestion_status as enum ('pending','resolving','downloading','staged','failed','blocked');
create type public.transport_media_retry_classification as enum ('retryable','requires_reresolution','terminal','configuration','requires_recheck');
create type public.transport_media_storage_state as enum ('reserved','object_stored','staged','failed','tombstoned');
create type public.transport_media_kind as enum ('image');

create table public.transport_message_attachments (
 id uuid primary key default gen_random_uuid(),
 source_message_id uuid not null unique references public.conversation_messages(id) on delete restrict,
 provider_message_binding_id uuid not null unique references public.transport_message_bindings(id) on delete restrict,
 media_kind public.transport_media_kind not null default 'image',
 provider_media_reference text not null check(length(provider_media_reference) between 1 and 512),
 caption text check(caption is null or length(caption) between 1 and 20000),
 created_at timestamptz not null default statement_timestamp()
);
comment on column public.transport_message_attachments.provider_media_reference is 'Opaque, service-only transport provenance. Never expose through conversation, audit, evidence, knowledge, or normal DTOs.';
comment on column public.transport_message_attachments.caption is 'Untrusted customer content only; never project, permission, filename, evidence, or instruction authority.';

create table public.transport_media_ingestion_commands (
 command_id uuid primary key default gen_random_uuid(),
 provider public.conversation_transport_provider not null default 'whatsapp',
 source_message_id uuid not null unique references public.conversation_messages(id) on delete restrict,
 provider_message_binding_id uuid not null unique references public.transport_message_bindings(id) on delete restrict,
 transport_identity_id uuid not null references public.conversation_transport_identities(id) on delete restrict,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 status public.transport_media_ingestion_status not null default 'pending',
 attempt_count smallint not null default 0 check(attempt_count between 0 and 3),
 staging_asset_id uuid unique,
 project_media_id uuid references public.project_media(id) on delete restrict,
 failure_code text check(failure_code is null or failure_code in (
   'provider_contract_unavailable','provider_auth_error','provider_media_not_found','provider_media_expired',
   'provider_metadata_transient','provider_download_transient','provider_download_ambiguous',
   'unsupported_media_type','media_too_large','media_integrity_mismatch','download_timeout',
   'staging_storage_failed','staging_finalize_failed','conversation_not_found','source_message_invalid',
   'provider_binding_invalid','ingestion_already_completed','configuration_error')),
 retry_classification public.transport_media_retry_classification,
 claim_token uuid, claimed_at timestamptz,
 created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(),
 completed_at timestamptz,
 check(project_media_id is null),
 check((status='staged')=(staging_asset_id is not null and completed_at is not null)),
 check((claim_token is null)=(claimed_at is null))
);

create table public.transport_media_staging_assets (
 staging_asset_id uuid primary key default gen_random_uuid(),
 ingestion_command_id uuid not null unique references public.transport_media_ingestion_commands(command_id) on delete restrict,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 source_message_id uuid not null unique references public.conversation_messages(id) on delete restrict,
 media_kind public.transport_media_kind not null default 'image',
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size bigint not null check(byte_size between 1 and 15000000),
 storage_bucket text not null default 'transport-media-staging' check(storage_bucket='transport-media-staging'),
 storage_path text not null unique check(storage_path ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/original\.(jpg|png|webp)$'),
 storage_state public.transport_media_storage_state not null default 'reserved',
 revision integer not null default 1 check(revision > 0),
 failure_code text,
 created_at timestamptz not null default statement_timestamp(), staged_at timestamptz, tombstoned_at timestamptz,
 check((storage_state='staged')=(staged_at is not null)),
 check((storage_state='tombstoned')=(tombstoned_at is not null))
);
alter table public.transport_media_ingestion_commands add constraint transport_media_command_staging_fk
 foreign key(staging_asset_id) references public.transport_media_staging_assets(staging_asset_id) on delete restrict;
create trigger transport_media_ingestion_updated before update on public.transport_media_ingestion_commands for each row execute function public.set_updated_at();

-- Atomic image-message/command creation. It is intentionally not wired to the
-- Meta parser until the official inbound image fields can be verified.
create function public.ingest_transport_inbound_image(
 target_sender_scope text,target_external_identity text,target_provider_message_id text,
 target_provider_media_reference text,target_occurred_at timestamptz,target_caption text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.transport_webhook_receipts%rowtype; identity_row public.conversation_transport_identities%rowtype;
 binding_row public.conversation_transport_bindings%rowtype; conversation_row public.conversations%rowtype;
 message_row public.conversation_messages%rowtype; message_binding public.transport_message_bindings%rowtype;
 attachment_row public.transport_message_attachments%rowtype; command_row public.transport_media_ingestion_commands%rowtype;
 sequence_number integer; now_at timestamptz:=statement_timestamp();
begin
 if length(target_sender_scope) not between 1 and 255 or length(target_external_identity) not between 1 and 255
  or length(target_provider_message_id) not between 1 and 512 or length(target_provider_media_reference) not between 1 and 512
  or target_occurred_at is null or (target_caption is not null and length(target_caption) not between 1 and 20000)
 then raise exception 'malformed_payload'; end if;
 insert into public.transport_webhook_receipts(provider,sender_scope,provider_event_identity,event_kind,processing_status)
 values('whatsapp',target_sender_scope,target_provider_message_id,'inbound_image','processing')
 on conflict(provider,sender_scope,provider_event_identity) do nothing returning * into receipt;
 if receipt.id is null then
  select * into receipt from public.transport_webhook_receipts where provider='whatsapp' and sender_scope=target_sender_scope and provider_event_identity=target_provider_message_id;
  select * into command_row from public.transport_media_ingestion_commands where source_message_id=receipt.internal_message_id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_media_ingestion_command',command_row.command_id,'whatsapp_media_ingestion_replayed',jsonb_build_object('command_id',command_row.command_id,'source_message_id',command_row.source_message_id,'result_code','replayed','timestamp',now_at));
  return jsonb_build_object('status','duplicate','receipt_id',receipt.id,'conversation_id',command_row.conversation_id,'internal_message_id',command_row.source_message_id,'ingestion_command_id',command_row.command_id,'cycle_eligible',false);
 end if;
 insert into public.conversation_transport_identities(provider,sender_scope,external_identity) values('whatsapp',target_sender_scope,target_external_identity)
 on conflict(provider,sender_scope,external_identity) do nothing returning * into identity_row;
 if identity_row.id is null then select * into identity_row from public.conversation_transport_identities where provider='whatsapp' and sender_scope=target_sender_scope and external_identity=target_external_identity for update; end if;
 if identity_row.status<>'active' then raise exception 'transport_identity_failed'; end if;
 select * into binding_row from public.conversation_transport_bindings where transport_identity_id=identity_row.id and status='active' for update;
 if binding_row.id is not null then select * into conversation_row from public.conversations where id=binding_row.conversation_id for update; end if;
 if conversation_row.id is null or conversation_row.status='closed' then
  if binding_row.id is not null then update public.conversation_transport_bindings set status='superseded',superseded_at=now_at where id=binding_row.id; end if;
  insert into public.conversations(customer_id,current_project_id,status,creation_command_key,created_by) values(identity_row.customer_id,null,'open','whatsapp:'||receipt.id,null) returning * into conversation_row;
  insert into public.conversation_transport_bindings(conversation_id,transport_identity_id,provider,status,revision) values(conversation_row.id,identity_row.id,'whatsapp','active',coalesce(binding_row.revision,0)+1) returning * into binding_row;
 end if;
 sequence_number:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=conversation_row.id),0)+1;
 insert into public.conversation_messages(conversation_id,sequence,direction,message_kind,actor_class,occurred_at,idempotency_key)
 values(conversation_row.id,sequence_number,'inbound','image_reference','customer',target_occurred_at,'whatsapp:'||receipt.id) returning * into message_row;
 insert into public.transport_message_bindings(provider,sender_scope,provider_message_id,internal_message_id,transport_identity_id,direction,provider_occurred_at)
 values('whatsapp',target_sender_scope,target_provider_message_id,message_row.id,identity_row.id,'inbound',target_occurred_at) returning * into message_binding;
 insert into public.transport_message_attachments(source_message_id,provider_message_binding_id,provider_media_reference,caption)
 values(message_row.id,message_binding.id,target_provider_media_reference,target_caption) returning * into attachment_row;
 insert into public.conversation_message_references(message_id,reference_id) values(message_row.id,attachment_row.id);
 insert into public.transport_media_ingestion_commands(source_message_id,provider_message_binding_id,transport_identity_id,conversation_id,status,failure_code,retry_classification)
 values(message_row.id,message_binding.id,identity_row.id,conversation_row.id,'blocked','provider_contract_unavailable','configuration') returning * into command_row;
 update public.transport_webhook_receipts set processing_status='processed',internal_message_id=message_row.id where id=receipt.id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_media_ingestion_command',command_row.command_id,'whatsapp_media_ingestion_started',jsonb_build_object('command_id',command_row.command_id,'source_message_id',message_row.id,'conversation_id',conversation_row.id,'result_code','provider_contract_unavailable','timestamp',now_at));
 return jsonb_build_object('status','recorded','receipt_id',receipt.id,'conversation_id',conversation_row.id,'internal_message_id',message_row.id,'ingestion_command_id',command_row.command_id,'cycle_eligible',false);
end$$;

create function public.reserve_transport_media_staging(target_command_id uuid,target_mime_type text,target_byte_size bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare command_row public.transport_media_ingestion_commands%rowtype; asset_row public.transport_media_staging_assets%rowtype; suffix text;
begin
 select * into command_row from public.transport_media_ingestion_commands where command_id=target_command_id for update;
 if command_row.command_id is null then raise exception 'source_message_invalid'; end if;
 if command_row.status='staged' then return jsonb_build_object('status','replayed','staging_asset_id',command_row.staging_asset_id); end if;
 if target_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'unsupported_media_type'; end if;
 if target_byte_size not between 1 and 15000000 then raise exception 'media_too_large'; end if;
 select * into asset_row from public.transport_media_staging_assets where ingestion_command_id=command_row.command_id;
 if asset_row.staging_asset_id is null then
  suffix:=case target_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
  asset_row.staging_asset_id:=gen_random_uuid();
  insert into public.transport_media_staging_assets(staging_asset_id,ingestion_command_id,conversation_id,source_message_id,mime_type,byte_size,storage_path)
  values(asset_row.staging_asset_id,command_row.command_id,command_row.conversation_id,command_row.source_message_id,target_mime_type,target_byte_size,'assets/'||asset_row.staging_asset_id||'/original.'||suffix) returning * into asset_row;
 end if;
 return jsonb_build_object('status','reserved','staging_asset_id',asset_row.staging_asset_id);
end$$;

create function public.finalize_transport_media_staging(target_command_id uuid,target_staging_asset_id uuid)
returns boolean language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare command_row public.transport_media_ingestion_commands%rowtype; asset_row public.transport_media_staging_assets%rowtype;
begin
 select * into command_row from public.transport_media_ingestion_commands where command_id=target_command_id for update;
 select * into asset_row from public.transport_media_staging_assets where staging_asset_id=target_staging_asset_id and ingestion_command_id=target_command_id for update;
 if command_row.status='staged' and command_row.staging_asset_id=target_staging_asset_id then return true; end if;
 if asset_row.staging_asset_id is null or not exists(select 1 from storage.objects o where o.bucket_id=asset_row.storage_bucket and o.name=asset_row.storage_path and (o.metadata->>'size')::bigint=asset_row.byte_size and o.metadata->>'mimetype'=asset_row.mime_type) then
  update public.transport_media_ingestion_commands set status='failed',failure_code='staging_finalize_failed',retry_classification='requires_recheck' where command_id=target_command_id;
  return false;
 end if;
 update public.transport_media_staging_assets set storage_state='staged',staged_at=statement_timestamp(),revision=revision+1 where staging_asset_id=target_staging_asset_id;
 update public.transport_media_ingestion_commands set status='staged',staging_asset_id=target_staging_asset_id,failure_code=null,retry_classification=null,claim_token=null,claimed_at=null,completed_at=statement_timestamp() where command_id=target_command_id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_media_ingestion_command',target_command_id,'whatsapp_media_staged',jsonb_build_object('command_id',target_command_id,'source_message_id',command_row.source_message_id,'staging_asset_id',target_staging_asset_id,'result_code','staged','timestamp',statement_timestamp()));
 return true;
end$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
 'transport-media-staging','transport-media-staging',false,15000000,array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set name=excluded.name,public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.transport_message_attachments enable row level security;
alter table public.transport_media_ingestion_commands enable row level security;
alter table public.transport_media_staging_assets enable row level security;
revoke all on public.transport_message_attachments,public.transport_media_ingestion_commands,public.transport_media_staging_assets from public,anon,authenticated;
revoke all on function public.ingest_transport_inbound_image(text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_transport_inbound_image(text,text,text,text,timestamptz,text) to service_role;
revoke all on function public.reserve_transport_media_staging(uuid,text,bigint),public.finalize_transport_media_staging(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_transport_media_staging(uuid,text,bigint),public.finalize_transport_media_staging(uuid,uuid) to service_role;
-- No storage.objects policies: browser roles have neither read nor write access.
