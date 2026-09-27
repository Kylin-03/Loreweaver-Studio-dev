import { create } from "zustand"
import { persist } from "zustand/middleware"
import { guardedLocalStorage } from "../../../lib/persistStorage"
import { updateMaterial, type MaterialDocument, type MaterialPath, type MaterialScalar } from "./model"
interface MaterialState {
  document: MaterialDocument | null
  pngBytes: Uint8Array | null
  open: (document: MaterialDocument, bytes?: Uint8Array) => void
  edit: (path: MaterialPath, value: MaterialScalar) => void
  restore: () => void
  attach: (bytes: Uint8Array) => void
}
export const useMaterialStore = create<MaterialState>()(
  persist(
    (set) => ({
      document: null,
      pngBytes: null,
      open: (document, bytes) => set({ document, pngBytes: document.png ? (bytes ?? null) : null }),
      edit: (path, value) =>
        set((s) =>
          s.document ? { document: { ...s.document, raw: updateMaterial(s.document.raw, path, value) } } : {},
        ),
      restore: () =>
        set((s) => (s.document ? { document: { ...s.document, raw: s.document.original } } : {})),
      attach: (pngBytes) => set({ pngBytes }),
    }),
    {
      name: "loreweaver-material-editor-v1",
      storage: guardedLocalStorage,
      partialize: (s) => ({ document: s.document }),
    },
  ),
)
