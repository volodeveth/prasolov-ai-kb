-- Prasolov AI KB - all objects prefixed kb_. Idempotent.
create extension if not exists vector with schema extensions;

create table if not exists kb_documents (
  id bigserial primary key,
  slug text unique not null,
  title text not null,
  category text not null check (category in
    ('Регламенти','Посадові інструкції','Навчальні матеріали','Скрипти','FAQ','Внутрішні політики')),
  roles text[] default null, -- null = visible to everyone
  updated_at date not null,
  chunk_count int default 0
);

create table if not exists kb_chunks (
  id bigserial primary key,
  doc_id bigint not null references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1024) not null,
  fts tsvector generated always as (to_tsvector('simple', content)) stored
);

create index if not exists kb_chunks_embedding_idx on kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists kb_chunks_fts_idx on kb_chunks using gin(fts);

create table if not exists kb_traces (
  id bigint generated always as identity primary key,
  trace_id uuid not null default gen_random_uuid(),
  role text,
  query text not null,
  answer text,
  sources jsonb,
  embedding_ms int, search_ms int, rerank_ms int,
  llm_ttfb_ms int, llm_total_ms int, total_ms int,
  chunks_found int default 0, chunks_reranked int default 0,
  top_relevance_score real, avg_relevance_score real,
  llm_prompt_tokens int default 0, llm_completion_tokens int default 0,
  cost_usd numeric(10,6),
  status text not null default 'success' check (status in ('success','error','rate_limited','no_answer')),
  error_message text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists kb_traces_ip_time_idx on kb_traces (ip_hash, created_at desc);
create index if not exists kb_traces_created_idx on kb_traces (created_at desc);

create or replace function kb_hybrid_search(
  query_text text,
  query_embedding extensions.vector(1024),
  user_role text,
  match_count int default 20,
  rrf_k int default 60
)
returns table (id bigint, doc_id bigint, content text, chunk_index int,
               title text, category text, rrf_score float)
language sql as $$
  with allowed as (
    select d.id, d.title, d.category from kb_documents d
    where d.roles is null or user_role = any(d.roles)
  ),
  fts as (
    select c.id, row_number() over
      (order by ts_rank_cd(c.fts, plainto_tsquery('simple', query_text)) desc) as rank
    from kb_chunks c join allowed a on a.id = c.doc_id
    where c.fts @@ plainto_tsquery('simple', query_text)
    limit 60
  ),
  vec as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from kb_chunks c join allowed a on a.id = c.doc_id
    order by c.embedding <=> query_embedding
    limit 60
  ),
  rrf as (
    select coalesce(fts.id, vec.id) as id,
      coalesce(0.5 / (rrf_k + fts.rank), 0.0) + coalesce(0.5 / (rrf_k + vec.rank), 0.0) as score
    from fts full outer join vec on fts.id = vec.id
  )
  select c.id, c.doc_id, c.content, c.chunk_index, a.title, a.category, rrf.score as rrf_score
  from rrf join kb_chunks c on c.id = rrf.id join allowed a on a.id = c.doc_id
  order by rrf.score desc limit match_count;
$$;
