-- AP-15-05-01: project_media remains the media authority; this table is an opaque,
-- classified evidence identity. Conversation/message/request persistence does not yet exist.
create table public.project_evidence (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  project_media_id uuid not null,
  evidence_target text not null,
  purpose text not null,
  source_channel text not null default 'internal_upload',
  source_actor_class text not null,
  binding_status text not null default 'bound',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_evidence_pkey primary key (id),
  constraint project_evidence_project_id_fkey foreign key (project_id)
    references public.projects(id) on delete restrict,
  constraint project_evidence_project_media_project_fkey foreign key (project_id, project_media_id)
    references public.project_media(project_id, id) on delete restrict,
  constraint project_evidence_target_check check (evidence_target in (
    'indoor_area_overview', 'outdoor_area_overview', 'indoor_unit_wall', 'outdoor_unit_location',
    'line_route_context', 'electrical_area', 'accessibility_context', 'room_overview',
    'room_dimensions_context', 'building_exterior_context', 'condensate_context', 'core_drilling_context'
  )),
  constraint project_evidence_purpose_check check (purpose in (
    'evaluate_indoor_position_context', 'evaluate_outdoor_position_context', 'evaluate_line_route_context',
    'evaluate_room_dimension_context', 'evaluate_electrical_context', 'evaluate_accessibility_context',
    'evaluate_condensate_context', 'evaluate_core_drilling_context', 'evaluate_building_context'
  )),
  constraint project_evidence_source_channel_check check (source_channel = 'internal_upload'),
  constraint project_evidence_source_actor_class_check check (source_actor_class = 'admin'),
  constraint project_evidence_binding_status_check check (binding_status in ('bound', 'unclassified', 'binding_ambiguous', 'invalidated')),
  constraint project_evidence_classified_binding_check check (binding_status = 'bound'),
  constraint project_evidence_semantic_binding_key unique (project_id, project_media_id, evidence_target, purpose)
);

create index project_evidence_project_idx on public.project_evidence(project_id);
create index project_evidence_media_idx on public.project_evidence(project_media_id);
create index project_evidence_target_idx on public.project_evidence(evidence_target);

create trigger project_evidence_updated before update on public.project_evidence
  for each row execute function public.set_updated_at();

alter table public.project_evidence enable row level security;
revoke all privileges on table public.project_evidence from public, anon, authenticated;
grant select, insert on table public.project_evidence to authenticated;

create policy "project evidence select active admin"
  on public.project_evidence for select to authenticated
  using (auth.uid() is not null and public.current_app_role() = 'admin' and exists (
    select 1 from public.projects where projects.id = project_evidence.project_id and projects.deleted_at is null
  ));

create policy "project evidence insert active admin"
  on public.project_evidence for insert to authenticated
  with check (
    auth.uid() is not null and public.current_app_role() = 'admin'
    and source_channel = 'internal_upload' and source_actor_class = 'admin' and binding_status = 'bound'
    and exists (select 1 from public.projects where projects.id = project_evidence.project_id and projects.deleted_at is null)
    and exists (select 1 from public.project_media
      where project_media.id = project_evidence.project_media_id
        and project_media.project_id = project_evidence.project_id
        and project_media.upload_status = 'ready' and project_media.deleted_at is null
        and project_media.media_type = 'image')
  );

comment on table public.project_evidence is 'Opaque classified Evidence identities bound to authoritative ready Project Media; contains no storage locators.';
comment on column public.project_evidence.id is 'Stable Evidence identity; deliberately distinct from project_media_id.';
