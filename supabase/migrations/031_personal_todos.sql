-- Личен TO DO list per акаунт (всеки staff user, основен админ или именуван алтернативен админ
-- получава отделен списък в рамките на същата фирма).
--
-- Owner-ключът е composite: (owner_kind, owner_key)
--   - 'staff'       → owner_key = staff_users.id (като текст)
--   - 'admin_main'  → owner_key = '*'
--   - 'admin_named' → owner_key = company_admin_pin_alternates.label

CREATE TABLE IF NOT EXISTS public.personal_todos (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_kind text NOT NULL,
  owner_key text NOT NULL,
  note text NOT NULL,
  due_at timestamptz,
  recurrence text NOT NULL DEFAULT 'none',
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_todos_owner_kind_chk
    CHECK (owner_kind IN ('staff', 'admin_main', 'admin_named')),
  CONSTRAINT personal_todos_recurrence_chk
    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
  CONSTRAINT personal_todos_note_nonempty
    CHECK (length(btrim(note)) > 0),
  CONSTRAINT personal_todos_owner_key_nonempty
    CHECK (length(btrim(owner_key)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_personal_todos_owner
  ON public.personal_todos (company_id, owner_kind, owner_key, done, due_at);

CREATE INDEX IF NOT EXISTS idx_personal_todos_owner_created
  ON public.personal_todos (company_id, owner_kind, owner_key, created_at DESC);

ALTER TABLE public.personal_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_all_anon" ON public.personal_todos;
CREATE POLICY "app_all_anon" ON public.personal_todos
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Updated_at trigger (използваме същия pattern - просто ручно set updated_at в UPDATE заявките от приложението).
