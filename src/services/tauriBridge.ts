import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { Project } from "../lib/types";
import type { RawPluginEntry } from "./storage";

export function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

export function initTauriBridge(): void {
  if (!isTauri()) return;

  const appWindow = getCurrentWindow();

  window.storage = {
    get: async (key: string) => {
      const res = await invoke<{ key: string; value: unknown } | null>("storage_get", { key });
      return res;
    },
    set: async (key: string, value: unknown) => {
      return invoke<{ key: string; ok: boolean }>("storage_set", { key, value });
    },
    delete: async (key: string) => {
      return invoke<{ key: string; deleted: boolean }>("storage_delete", { key });
    },
    list: async (prefix?: string) => {
      return invoke<{ keys: string[]; prefix?: string }>("storage_list", { prefix });
    },
  };

  window.config = {
    getProjects: async () => {
      return invoke<Project[]>("config_get_projects");
    },
    setProjects: async (projects: Project[]) => {
      return invoke<{ ok: boolean }>("config_set_projects", { projects });
    },
  };

  window.dataIO = {
    export: async (payload: unknown) => {
      return invoke<{ canceled: boolean; filePath?: string }>("data_export", { payload });
    },
    import: async () => {
      return invoke<{ canceled: boolean; filePath?: string; error?: string; data?: unknown }>("data_import");
    },
  };

  window.images = {
    save: async (buffer: ArrayBuffer) => {
      const bytes = Array.from(new Uint8Array(buffer));
      return invoke<{ url: string; width: number; height: number }>("images_save", { buffer: bytes });
    },
    prune: async (usedFiles: string[]) => {
      return invoke<{ removed: number }>("images_prune", { usedFiles });
    },
  };

  window.plugins = {
    list: async () => {
      return invoke<RawPluginEntry[]>("plugins_list");
    },
    saveFile: async (payload: { name: string; mime: string; base64?: string; text?: string }) => {
      return invoke<{ canceled: boolean; filePath?: string }>("plugins_save_file", { payload });
    },
    watch: async (id: string, dir: string) => {
      return invoke<{ ok: boolean; reason?: string }>("plugins_watch", { id, dir });
    },
    onReload: (callback: (payload: { id: string }) => void) => {
      let unlisten: (() => void) | undefined;
      listen<{ id: string }>("host:reload", (event) => {
        callback(event.payload);
      }).then((u) => {
        unlisten = u;
      });
      return () => {
        if (unlisten) unlisten();
      };
    },
  };

  window.windowControls = {
    minimize: async () => {
      try {
        await invoke("window_minimize");
      } catch {
        await appWindow.minimize();
      }
    },
    toggleMaximize: async () => {
      try {
        await invoke("window_toggle_maximize");
      } catch {
        await appWindow.toggleMaximize();
      }
    },
    close: async () => {
      try {
        await invoke("window_close");
      } catch {
        await appWindow.close();
      }
    },
    isMaximized: async () => {
      try {
        return await invoke<boolean>("window_is_maximized");
      } catch {
        return appWindow.isMaximized();
      }
    },
    onMaximizedChanged: (cb: (isMaximized: boolean) => void) => {
      let unlisten: (() => void) | undefined;
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      let lastMax: boolean | null = null;

      appWindow
        .onResized(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(async () => {
            try {
              const max = await invoke<boolean>("window_is_maximized").catch(() => appWindow.isMaximized());
              if (max !== lastMax) {
                lastMax = max;
                cb(max);
              }
            } catch {
              // ignore error if window destroyed
            }
          }, 80);
        })
        .then((u) => {
          unlisten = u;
        });
      return () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        if (unlisten) unlisten();
      };
    },
  };
}

