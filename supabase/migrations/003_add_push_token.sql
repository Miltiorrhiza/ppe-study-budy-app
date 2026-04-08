-- Migration: 003_add_push_token.sql
-- Add push_token column to user_profiles for Expo Push Token storage

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;
