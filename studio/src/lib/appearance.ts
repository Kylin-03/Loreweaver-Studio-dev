import { invoke } from "@tauri-apps/api/core"
export const importBackground = (scope: string | null = null) =>
  invoke<string | null>("appearance_import_background", { scope })
export const loadBackground = (scope: string | null = null) =>
  invoke<string | null>("appearance_load_background", { scope })
export const removeBackground = (scope: string | null = null) =>
  invoke<void>("appearance_remove_background", { scope })
export const copyBackground = (source: string | null, destination: string) =>
  invoke<void>("appearance_copy_background", { source, destination })
