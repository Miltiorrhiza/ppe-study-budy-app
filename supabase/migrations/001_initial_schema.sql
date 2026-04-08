-- Study Buddy App - Initial Database Schema
-- Migration: 001_initial_schema.sql

-- ─── user_profiles ────────────────────────────────────────────────────────────
CREATE TABLE user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  university   TEXT,
  push_token   TEXT,
  push_enabled BOOLEAN DEFAULT true,
  language     TEXT DEFAULT 'en',  -- 'zh' | 'en'
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profiles" ON user_profiles
  USING (id = auth.uid());

-- Automatically create a profile row when a new auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, university, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'university',
    'en'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── courses ──────────────────────────────────────────────────────────────────
CREATE TABLE courses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_courses" ON courses
  USING (user_id = auth.uid());

-- ─── tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  course_id    UUID REFERENCES courses(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  due_at       TIMESTAMPTZ NOT NULL,
  priority     TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'high',
  completed    BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_tasks" ON tasks
  USING (user_id = auth.uid());

-- ─── task_reminders ───────────────────────────────────────────────────────────
CREATE TABLE task_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  remind_at       TIMESTAMPTZ NOT NULL,
  notification_id TEXT,
  sent            BOOLEAN DEFAULT false
);

ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_task_reminders" ON task_reminders
  USING (
    task_id IN (SELECT id FROM tasks WHERE user_id = auth.uid())
  );

-- ─── task_attachments ─────────────────────────────────────────────────────────
CREATE TABLE task_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_task_attachments" ON task_attachments
  USING (
    task_id IN (SELECT id FROM tasks WHERE user_id = auth.uid())
  );

-- ─── notes ────────────────────────────────────────────────────────────────────
CREATE TABLE notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_notes" ON notes
  USING (user_id = auth.uid());

-- ─── focus_sessions ───────────────────────────────────────────────────────────
CREATE TABLE focus_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
  duration_sec INTEGER NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ NOT NULL
);

ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_focus_sessions" ON focus_sessions
  USING (user_id = auth.uid());

-- ─── subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL CHECK (plan IN ('free', 'pro')),
  provider            TEXT,
  expires_at          TIMESTAMPTZ,
  revenuecat_user_id  TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_subscriptions" ON subscriptions
  USING (user_id = auth.uid());

-- ─── lms_integrations ─────────────────────────────────────────────────────────
CREATE TABLE lms_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('ical', 'ai_agent')),
  label           TEXT,
  ical_url        TEXT,
  lms_url         TEXT,
  last_synced_at  TIMESTAMPTZ,
  sync_enabled    BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lms_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_lms_integrations" ON lms_integrations
  USING (user_id = auth.uid());

-- ─── ical_synced_events ───────────────────────────────────────────────────────
CREATE TABLE ical_synced_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id  UUID NOT NULL REFERENCES lms_integrations(id) ON DELETE CASCADE,
  ical_uid        TEXT NOT NULL,
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  synced_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (integration_id, ical_uid)
);

ALTER TABLE ical_synced_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_ical_synced_events" ON ical_synced_events
  USING (
    integration_id IN (SELECT id FROM lms_integrations WHERE user_id = auth.uid())
  );
