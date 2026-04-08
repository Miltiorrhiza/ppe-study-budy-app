import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { registerPushToken } from '../services/notification.service';

// ---- Types ----

interface NotificationState {
  pushEnabled: boolean;
}

interface NotificationActions {
  /**
   * Toggle push notifications on/off.
   * Updates local state and syncs to user_profiles.push_enabled in Supabase.
   */
  setPushEnabled: (enabled: boolean) => Promise<void>;

  /**
   * Load the push_enabled value from Supabase for the given user.
   */
  initialize: (userId: string) => Promise<void>;
}

// ---- Store ----

export const useNotificationStore = create<NotificationState & NotificationActions>((set) => ({
  // Initial state
  pushEnabled: true,

  setPushEnabled: async (enabled: boolean) => {
    // Optimistically update local state
    set({ pushEnabled: enabled });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) {
        console.warn('[NotificationStore] No authenticated user, skipping Supabase sync.');
        return;
      }

      const { error } = await supabase
        .from('user_profiles')
        .update({ push_enabled: enabled })
        .eq('id', userId);

      if (error) {
        console.warn('[NotificationStore] Failed to sync push_enabled to Supabase:', error.message);
      } else if (enabled) {
        await registerPushToken(userId);
      }
    } catch (err) {
      console.warn('[NotificationStore] Unexpected error syncing push_enabled:', err);
    }
  },

  initialize: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('push_enabled')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[NotificationStore] Failed to load push_enabled:', error.message);
        return;
      }

      if (data && typeof data.push_enabled === 'boolean') {
        set({ pushEnabled: data.push_enabled });
        if (data.push_enabled) {
          await registerPushToken(userId);
        }
      }
    } catch (err) {
      console.warn('[NotificationStore] Unexpected error loading push_enabled:', err);
    }
  },
}));
