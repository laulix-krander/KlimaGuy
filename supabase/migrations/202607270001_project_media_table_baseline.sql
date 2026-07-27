create table public.project_media (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  storage_bucket text not null default 'project-media',
  storage_path text not null,
  original_filename text not null,
  stored_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  media_type text not null,
  category text not null default 'other',
  source text not null default 'manual_upload',
  upload_status text not null default 'pending',
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  caption text null,
  constraint project_media_pkey primary key (id),
  constraint project_media_project_id_fkey foreign key (project_id)
    references public.projects(id) on delete restrict,
  constraint project_media_uploaded_by_fkey foreign key (uploaded_by)
    references auth.users(id) on delete restrict,
  constraint project_media_storage_bucket_check
    check (storage_bucket = 'project-media'),
  constraint project_media_category_check
    check (category in (
      'indoor_area',
      'outdoor_area',
      'indoor_unit_location',
      'outdoor_unit_location',
      'pipe_route',
      'electrical_connection',
      'condensate_route',
      'facade',
      'roof',
      'balcony',
      'floor_plan',
      'technical_document',
      'customer_document',
      'other'
    )),
  constraint project_media_source_check
    check (source = 'manual_upload'),
  constraint project_media_upload_status_check
    check (upload_status in ('pending', 'ready', 'failed')),
  constraint project_media_media_type_check
    check (media_type in ('image', 'document')),
  constraint project_media_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint project_media_mime_media_type_check
    check (
      (mime_type in ('image/jpeg', 'image/png', 'image/webp') and media_type = 'image')
      or (mime_type = 'application/pdf' and media_type = 'document')
    ),
  constraint project_media_file_size_positive_check
    check (file_size_bytes > 0),
  constraint project_media_file_size_limit_check
    check (
      (mime_type in ('image/jpeg', 'image/png', 'image/webp') and file_size_bytes <= 15000000)
      or (mime_type = 'application/pdf' and file_size_bytes <= 25000000)
    ),
  constraint project_media_original_filename_check
    check (
      char_length(original_filename) between 1 and 255
      and btrim(original_filename) <> ''
      and original_filename not in ('.', '..')
      and position('/' in original_filename) = 0
      and position(E'\\' in original_filename) = 0
      and original_filename !~ '[[:cntrl:]]'
    ),
  constraint project_media_stored_filename_check
    check (
      char_length(stored_filename) <= 64
      and stored_filename ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
    ),
  constraint project_media_mime_extension_check
    check (
      (mime_type = 'image/jpeg' and stored_filename ~ '\.jpg$')
      or (mime_type = 'image/png' and stored_filename ~ '\.png$')
      or (mime_type = 'image/webp' and stored_filename ~ '\.webp$')
      or (mime_type = 'application/pdf' and stored_filename ~ '\.pdf$')
    ),
  -- The path is a locator, not an authorization decision, and contains no customer data or original filename.
  constraint project_media_storage_path_check
    check (
      storage_path = 'projects/' || project_id::text || '/originals/' || id::text || '/' || stored_filename
    ),
  constraint project_media_storage_bucket_path_key
    unique (storage_bucket, storage_path),
  constraint project_media_caption_check
    check (caption is null or char_length(caption) <= 1000)
);

create index project_media_active_project_created_idx
  on public.project_media(project_id, created_at desc, id)
  where deleted_at is null;

create or replace function public.prevent_project_media_protected_field_updates()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.original_filename is distinct from old.original_filename
    or new.stored_filename is distinct from old.stored_filename
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.media_type is distinct from old.media_type
    or new.source is distinct from old.source
    or new.uploaded_by is distinct from old.uploaded_by
    or new.created_at is distinct from old.created_at
    or new.deleted_at is distinct from old.deleted_at then
    raise exception 'project media protected fields cannot be changed';
  end if;

  -- Upload status constrains metadata state only; upload orchestration follows in AP-12-02.
  if new.upload_status is distinct from old.upload_status
    and not (
      old.upload_status = 'pending'
      and new.upload_status in ('ready', 'failed')
    ) then
    raise exception 'project media upload status transition is not allowed';
  end if;

  return new;
end;
$$;

create trigger project_media_protected_fields_guard
  before update on public.project_media
  for each row
  execute function public.prevent_project_media_protected_field_updates();

create trigger project_media_updated
  before update on public.project_media
  for each row
  execute function public.set_updated_at();

-- `project-media` is private-bucket metadata only; bucket creation and Storage policies follow later.
-- customer_id is intentionally derived through projects rather than duplicated here.
-- RLS is enabled deny-by-default; application policies and grants follow in AP-12-01-02.
-- Normal roles receive no physical DELETE path.
alter table public.project_media enable row level security;
revoke all on table public.project_media from anon, authenticated;
