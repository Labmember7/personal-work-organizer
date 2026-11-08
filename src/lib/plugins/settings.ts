// Réglages déclarés par un plugin (`contributes.settings`) : fusion des valeurs
// par défaut (manifeste) avec ce que l'utilisateur a réellement sauvegardé, et
// persistance côté hôte. Les réglages d'un plugin ne sont lisibles que par lui
// (cf. PLUGIN_FORMAT_V2.md § 4 « settings »).

import { loadValue, saveValue } from "../../services/storage";
import type { SettingDef } from "./types";

const SETTINGS_PREFIX = "plugin-settings:";

export function defaultSettings(defs: Record<string, SettingDef> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!defs) return out;
  for (const [id, def] of Object.entries(defs)) out[id] = def.default;
  return out;
}

// Valeurs effectives : défauts du manifeste, surchargés par le stockage.
export function mergeSettings(
  defs: Record<string, SettingDef> | undefined,
  stored: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = defaultSettings(defs);
  if (stored && typeof stored === "object") {
    for (const k of Object.keys(out)) {
      if (k in stored) out[k] = stored[k];
    }
  }
  return out;
}

export async function loadPluginSettings(
  pluginId: string,
  defs: Record<string, SettingDef> | undefined,
): Promise<Record<string, unknown>> {
  const raw = await loadValue<Record<string, unknown>>(SETTINGS_PREFIX + pluginId);
  return mergeSettings(defs, raw && typeof raw === "object" ? raw : null);
}

export async function savePluginSettings(
  pluginId: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  return saveValue(SETTINGS_PREFIX + pluginId, values);
}
