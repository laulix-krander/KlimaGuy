-- Step 9: productive, lifecycle-fenced WhatsApp image promotion. Provider URLs
-- and tokens never enter PostgreSQL; both buckets remain private.
alter table public.transport_message_attachments add column declared_mime_type text
  check(declared_mime_type is null or length(declared_mime_type) between 1 and 255);
alter table public.project_media drop constraint project_media_source_check;
alter table public.project_media add constraint project_media_source_check check(source in ('manual_upload','whatsapp'));
alter table public.project_media add column source_conversation_id uuid references public.conversations(id) on delete restrict;
alter table public.project_media add column source_message_id uuid references public.conversation_messages(id) on delete restrict;
alter table public.project_media add column source_attachment_id uuid references public.transport_message_attachments(id) on delete restrict;
alter table public.project_media add constraint project_media_whatsapp_provenance_check check(
 (source='manual_upload' and source_conversation_id is null and source_message_id is null and source_attachment_id is null)
 or (source='whatsapp' and source_conversation_id is not null and source_message_id is not null and source_attachment_id is not null));
create unique index project_media_source_message_key on public.project_media(source_message_id) where source_message_id is not null;
alter table public.transport_media_ingestion_commands drop constraint transport_media_ingestion_commands_project_media_id_check;

create or replace function public.ingest_transport_inbound_image(
 target_sender_scope text,target_external_identity text,target_provider_message_id text,
 target_provider_media_reference text,target_occurred_at timestamptz,target_caption text default null,
 target_declared_mime_type text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.transport_webhook_receipts%rowtype; identity_row public.conversation_transport_identities%rowtype;
 binding_row public.conversation_transport_bindings%rowtype; conversation_row public.conversations%rowtype;
 message_row public.conversation_messages%rowtype; message_binding public.transport_message_bindings%rowtype;
 attachment_row public.transport_message_attachments%rowtype; command_row public.transport_media_ingestion_commands%rowtype;
 sequence_number integer; now_at timestamptz:=statement_timestamp();
begin
 if length(target_sender_scope) not between 1 and 255 or length(target_external_identity) not between 1 and 255 or length(target_provider_message_id) not between 1 and 512 or length(target_provider_media_reference) not between 1 and 512 or target_occurred_at is null or (target_caption is not null and length(target_caption) not between 1 and 20000) or (target_declared_mime_type is not null and length(target_declared_mime_type) not between 1 and 255) then raise exception 'malformed_payload'; end if;
 insert into public.transport_webhook_receipts(provider,sender_scope,provider_event_identity,event_kind,processing_status) values('whatsapp',target_sender_scope,target_provider_message_id,'inbound_image','processing') on conflict(provider,sender_scope,provider_event_identity) do nothing returning * into receipt;
 if receipt.id is null then
  select * into receipt from public.transport_webhook_receipts where provider='whatsapp' and sender_scope=target_sender_scope and provider_event_identity=target_provider_message_id;
  select * into command_row from public.transport_media_ingestion_commands where source_message_id=receipt.internal_message_id;
  return jsonb_build_object('status','duplicate','receipt_id',receipt.id,'conversation_id',command_row.conversation_id,'internal_message_id',command_row.source_message_id,'ingestion_command_id',command_row.command_id,'cycle_eligible',false);
 end if;
 insert into public.conversation_transport_identities(provider,sender_scope,external_identity) values('whatsapp',target_sender_scope,target_external_identity) on conflict(provider,sender_scope,external_identity) do nothing returning * into identity_row;
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
 insert into public.conversation_messages(conversation_id,sequence,direction,message_kind,actor_class,occurred_at,idempotency_key) values(conversation_row.id,sequence_number,'inbound','image_reference','customer',target_occurred_at,'whatsapp:'||receipt.id) returning * into message_row;
 insert into public.transport_message_bindings(provider,sender_scope,provider_message_id,internal_message_id,transport_identity_id,direction,provider_occurred_at) values('whatsapp',target_sender_scope,target_provider_message_id,message_row.id,identity_row.id,'inbound',target_occurred_at) returning * into message_binding;
 insert into public.transport_message_attachments(source_message_id,provider_message_binding_id,provider_media_reference,caption,declared_mime_type) values(message_row.id,message_binding.id,target_provider_media_reference,target_caption,target_declared_mime_type) returning * into attachment_row;
 insert into public.conversation_message_references(message_id,reference_id) values(message_row.id,attachment_row.id);
 insert into public.transport_media_ingestion_commands(source_message_id,provider_message_binding_id,transport_identity_id,conversation_id,status) values(message_row.id,message_binding.id,identity_row.id,conversation_row.id,'pending') returning * into command_row;
 update public.transport_webhook_receipts set processing_status='processed',internal_message_id=message_row.id where id=receipt.id;
 return jsonb_build_object('status','recorded','receipt_id',receipt.id,'conversation_id',conversation_row.id,'internal_message_id',message_row.id,'ingestion_command_id',command_row.command_id,'cycle_eligible',false);
end$$;

create function public.claim_transport_media_ingestion(target_command_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.transport_media_ingestion_commands%rowtype; attachment public.transport_message_attachments%rowtype;
begin
 select * into cmd from public.transport_media_ingestion_commands where command_id=target_command_id for update;
 if cmd.command_id is null then raise exception 'source_message_invalid'; end if;
 if cmd.status='staged' then return jsonb_build_object('status','completed','command_id',cmd.command_id,'conversation_id',cmd.conversation_id,'source_message_id',cmd.source_message_id,'provider_media_reference',null,'declared_mime_type',null,'attempt_count',cmd.attempt_count); end if;
 if cmd.attempt_count>=3 or cmd.status='blocked' then return jsonb_build_object('status','terminal','command_id',cmd.command_id,'conversation_id',cmd.conversation_id,'source_message_id',cmd.source_message_id,'provider_media_reference',null,'declared_mime_type',null,'attempt_count',cmd.attempt_count); end if;
 if cmd.claim_token is not null and cmd.claimed_at>statement_timestamp()-interval '2 minutes' then return jsonb_build_object('status','busy','command_id',cmd.command_id,'conversation_id',cmd.conversation_id,'source_message_id',cmd.source_message_id,'provider_media_reference',null,'declared_mime_type',null,'attempt_count',cmd.attempt_count); end if;
 select * into attachment from public.transport_message_attachments where source_message_id=cmd.source_message_id;
 update public.transport_media_ingestion_commands set status='resolving',attempt_count=attempt_count+1,claim_token=gen_random_uuid(),claimed_at=statement_timestamp(),failure_code=null,retry_classification=null where command_id=cmd.command_id returning * into cmd;
 return jsonb_build_object('status','claimed','command_id',cmd.command_id,'conversation_id',cmd.conversation_id,'source_message_id',cmd.source_message_id,'provider_media_reference',attachment.provider_media_reference,'declared_mime_type',attachment.declared_mime_type,'attempt_count',cmd.attempt_count);
end$$;

create function public.reserve_transport_media_promotion(target_command_id uuid,target_mime_type text,target_byte_size bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.transport_media_ingestion_commands%rowtype; conv public.conversations%rowtype; binding public.conversation_transport_bindings%rowtype; asset public.transport_media_staging_assets%rowtype; media public.project_media%rowtype; attachment_id uuid; actor_id uuid; suffix text;
begin
 select * into cmd from public.transport_media_ingestion_commands where command_id=target_command_id for update;
 select * into conv from public.conversations where id=cmd.conversation_id for update;
 select * into binding from public.conversation_transport_bindings where conversation_id=conv.id and transport_identity_id=cmd.transport_identity_id and status='active' for update;
 if conv.status<>'open' or conv.current_project_id is null or binding.id is null then raise exception 'provider_binding_invalid'; end if;
 if target_mime_type not in('image/jpeg','image/png','image/webp') then raise exception 'unsupported_media_type'; end if; if target_byte_size not between 1 and 15000000 then raise exception 'media_too_large'; end if;
 suffix:=case target_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 select * into asset from public.transport_media_staging_assets where ingestion_command_id=cmd.command_id;
 if asset.staging_asset_id is null then insert into public.transport_media_staging_assets(ingestion_command_id,conversation_id,source_message_id,mime_type,byte_size,storage_path) values(cmd.command_id,cmd.conversation_id,cmd.source_message_id,target_mime_type,target_byte_size,'assets/'||gen_random_uuid()||'/original.'||suffix) returning * into asset; update public.transport_media_staging_assets set storage_path='assets/'||asset.staging_asset_id||'/original.'||suffix where staging_asset_id=asset.staging_asset_id returning * into asset; end if;
 select id into attachment_id from public.transport_message_attachments where source_message_id=cmd.source_message_id; select (public.resolve_system_actor()->>'auth_user_id')::uuid into actor_id;
 select * into media from public.project_media where source_message_id=cmd.source_message_id;
 if media.id is null then media.id:=gen_random_uuid(); insert into public.project_media(id,project_id,storage_path,original_filename,stored_filename,mime_type,file_size_bytes,media_type,source,upload_status,uploaded_by,caption,source_conversation_id,source_message_id,source_attachment_id) select media.id,conv.current_project_id,'projects/'||conv.current_project_id||'/originals/'||media.id||'/'||media.id||'.'||suffix,'whatsapp-image.'||suffix,media.id||'.'||suffix,target_mime_type,target_byte_size,'image','whatsapp','pending',actor_id,left(a.caption,1000),conv.id,cmd.source_message_id,a.id from public.transport_message_attachments a where a.id=attachment_id returning * into media; end if;
 update public.transport_media_ingestion_commands set status='downloading',staging_asset_id=asset.staging_asset_id,project_media_id=media.id where command_id=cmd.command_id;
 return jsonb_build_object('status','reserved','staging_asset_id',asset.staging_asset_id,'project_media_id',media.id,'staging_path',asset.storage_path,'project_bucket','project-media','project_path',media.storage_path);
end$$;

create function public.finalize_transport_media_promotion(target_command_id uuid,target_staging_asset_id uuid,target_project_media_id uuid) returns boolean language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare cmd public.transport_media_ingestion_commands%rowtype; conv public.conversations%rowtype; media public.project_media%rowtype; asset public.transport_media_staging_assets%rowtype;
begin
 select * into cmd from public.transport_media_ingestion_commands where command_id=target_command_id for update; select * into conv from public.conversations where id=cmd.conversation_id for update; select * into media from public.project_media where id=target_project_media_id and source_conversation_id=conv.id and source_message_id=cmd.source_message_id for update; select * into asset from public.transport_media_staging_assets where staging_asset_id=target_staging_asset_id and ingestion_command_id=cmd.command_id for update;
 if cmd.status='staged' and media.upload_status='ready' then return true; end if;
 if conv.status<>'open' or conv.current_project_id<>media.project_id or not exists(select 1 from public.conversation_transport_bindings where conversation_id=conv.id and transport_identity_id=cmd.transport_identity_id and status='active') then update public.project_media set upload_status='failed' where id=media.id; update public.transport_media_ingestion_commands set status='blocked',failure_code='provider_binding_invalid',retry_classification='terminal',claim_token=null,claimed_at=null where command_id=cmd.command_id; return false; end if;
 if not exists(select 1 from storage.objects where bucket_id=asset.storage_bucket and name=asset.storage_path and (metadata->>'size')::bigint=asset.byte_size and metadata->>'mimetype'=asset.mime_type) or not exists(select 1 from storage.objects where bucket_id=media.storage_bucket and name=media.storage_path and (metadata->>'size')::bigint=media.file_size_bytes and metadata->>'mimetype'=media.mime_type) then return false; end if;
 update public.transport_media_staging_assets set storage_state='staged',staged_at=statement_timestamp(),revision=revision+1 where staging_asset_id=asset.staging_asset_id; update public.project_media set upload_status='ready' where id=media.id; update public.transport_media_ingestion_commands set status='staged',completed_at=statement_timestamp(),failure_code=null,retry_classification=null,claim_token=null,claimed_at=null where command_id=cmd.command_id; return true;
end$$;

create function public.fail_transport_media_ingestion(target_command_id uuid,target_failure_code text,target_retryable boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.transport_media_ingestion_commands set status=case when target_retryable and attempt_count<3 then 'failed'::public.transport_media_ingestion_status else 'blocked'::public.transport_media_ingestion_status end,failure_code=target_failure_code,retry_classification=case when target_retryable and attempt_count<3 then 'retryable'::public.transport_media_retry_classification else 'terminal'::public.transport_media_retry_classification end,claim_token=null,claimed_at=null where command_id=target_command_id and status<>'staged'; end$$;

revoke all on function public.ingest_transport_inbound_image(text,text,text,text,timestamptz,text,text),public.claim_transport_media_ingestion(uuid),public.reserve_transport_media_promotion(uuid,text,bigint),public.finalize_transport_media_promotion(uuid,uuid,uuid),public.fail_transport_media_ingestion(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.ingest_transport_inbound_image(text,text,text,text,timestamptz,text,text),public.claim_transport_media_ingestion(uuid),public.reserve_transport_media_promotion(uuid,text,bigint),public.finalize_transport_media_promotion(uuid,uuid,uuid),public.fail_transport_media_ingestion(uuid,text,boolean) to service_role;
