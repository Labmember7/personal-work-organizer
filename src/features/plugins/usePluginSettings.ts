import { useEffect, useState } from "react";
import { loadPluginSettings, savePluginSettings } from "../../lib/plugins/settings";
import type { SettingDef } from "../../lib/plugins/types";

// Charge et expose les réglages effectifs d'un plugin (défauts du manifeste
// fusionnés au stockage), avec une mise à jour locale instantanée. `defs`
// provient de `contributes.settings` du manifeste.
export function usePluginSettings(pluginId: string | null, defs: Record<string, SettingDef> | undefined) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    if (!pluginId) {
      setSettings({});
      return;
    }
    loadPluginSettings(pluginId, defs).then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
    };
    // `defs` est stable pour un plugin donné ; recharger sur changement d'id suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

  const setSetting = (id: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [id]: value }));
  };

  const save = () => {
    if (pluginId) return savePluginSettings(pluginId, settings);
    return Promise.resolve(false);
  };

  return { settings, setSetting, save };
}
