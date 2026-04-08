/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(auth)` | `/(auth)/login` | `/(auth)/register` | `/(tabs)` | `/(tabs)/` | `/(tabs)/calendar` | `/(tabs)/notes` | `/(tabs)/profile` | `/(tabs)/settings` | `/(tabs)/tasks` | `/_sitemap` | `/calendar` | `/login` | `/modals` | `/modals/add-task` | `/modals/ai-agent-sync` | `/modals/focus-timer` | `/modals/ical-connect` | `/modals/note-editor` | `/modals/subscription` | `/modals/task-detail` | `/notes` | `/profile` | `/register` | `/settings` | `/tasks`;
      DynamicRoutes: never;
      DynamicRouteTemplate: never;
    }
  }
}
