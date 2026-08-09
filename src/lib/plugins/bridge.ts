// Pont de messages postMessage entre l'hôte et un plugin. Encode dans un sens,
// décode et valide dans l'autre. Ne lève jamais : un message malformé ou
// d'une capacité non accordée rend `null`, il ne casse jamais l'hôte.
//
// L'authentification de la fenêtre émettrice (`event.source`) est à la charge
// de l'appelant (`usePluginHost`) : ce module ne connaît pas le DOM.

import {
  PLUGIN_API_VERSION,
  PLUGIN_MESSAGE_NS,
  type HostMessage,
  type PluginCapability,
  type PluginEnvelope,
  type PluginMessage,
} from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function encode<M extends HostMessage | PluginMessage>(pluginId: string, message: M): PluginEnvelope<M> {
  return { ns: PLUGIN_MESSAGE_NS, protocol: PLUGIN_API_VERSION, pluginId, message };
}

interface RawEnvelope {
  ns: unknown;
  protocol: unknown;
  pluginId: unknown;
  message: Record<string, unknown>;
}

function readEnvelope(raw: unknown): RawEnvelope | null {
  if (!isRecord(raw)) return null;
  if (raw.ns !== PLUGIN_MESSAGE_NS) return null;
  if (!isRecord(raw.message) || typeof raw.message.type !== "string") return null;
  return { ns: raw.ns, protocol: raw.protocol, pluginId: raw.pluginId, message: raw.message };
}

/**
 * Décode un message hôte -> plugin. Le SDK côté plugin s'en inspire (il vit en
 * JS injecté, pas ici) ; côté TS ce décodeur sert surtout aux tests et à
 * documenter le contrat. Aucune capacité à vérifier : l'hôte est de confiance.
 */
export function decodeHostMessage(raw: unknown): HostMessage | null {
  const env = readEnvelope(raw);
  if (!env || env.protocol !== PLUGIN_API_VERSION) return null;
  return env.message as unknown as HostMessage;
}

/** Capacité requise pour émettre ce type de message ; `null` = aucune. */
export function capabilityFor(type: string): PluginCapability | null {
  switch (type) {
    case "plugin:doc:save":
    case "plugin:dirty":
      return "doc";
    case "plugin:snapshot:refresh":
      return "tasks:read";
    case "plugin:task:reveal":
      return "task:reveal";
    case "plugin:toast":
      return "toast";
    case "plugin:file:save":
      return "file:save";
    case "plugin:fullscreen":
      return "fullscreen";
    case "plugin:log":
      return "debug";
    default:
      // "plugin:ready" et tout type inconnu : pas de capacité à accorder.
      return null;
  }
}

const PLUGIN_MESSAGE_TYPES = new Set<string>([
  "plugin:ready",
  "plugin:doc:save",
  "plugin:dirty",
  "plugin:snapshot:refresh",
  "plugin:task:reveal",
  "plugin:toast",
  "plugin:file:save",
  "plugin:fullscreen",
  "plugin:log",
]);

const LOG_LEVELS = new Set(["log", "info", "warn", "error"]);

// Forme minimale par variante : un message qui prétend être du bon type mais
// n'a pas les champs attendus est rejeté ici plutôt que plus loin.
function messageShapeOk(message: Record<string, unknown>): boolean {
  switch (message.type) {
    case "plugin:ready":
      return typeof message.apiVersion === "number";
    case "plugin:doc:save":
      return isRecord(message.patch) && "data" in message.patch;
    case "plugin:dirty":
      return typeof message.dirty === "boolean";
    case "plugin:snapshot:refresh":
      return true;
    case "plugin:task:reveal":
      return typeof message.id === "string" && message.id.length > 0;
    case "plugin:toast":
      return typeof message.message === "string" && message.message.length > 0;
    case "plugin:file:save":
      return (
        typeof message.name === "string" &&
        typeof message.mime === "string" &&
        (typeof message.base64 === "string" || typeof message.text === "string")
      );
    case "plugin:fullscreen":
      return typeof message.on === "boolean";
    case "plugin:log":
      return (
        typeof message.level === "string" &&
        LOG_LEVELS.has(message.level) &&
        Array.isArray(message.args) &&
        message.args.every((a) => typeof a === "string")
      );
    default:
      return false;
  }
}

/**
 * Décode un message plugin -> hôte. Vérifie l'enveloppe (`ns`, `protocol`),
 * le `pluginId` (contre les mélanges entre iframes), la forme du message, et
 * la capacité requise. Rend `null` pour tout ce qui ne passe pas ces gardes.
 */
export function decodePluginMessage(
  raw: unknown,
  pluginId: string,
  capabilities: readonly PluginCapability[],
): PluginMessage | null {
  const env = readEnvelope(raw);
  if (!env) return null;
  if (env.protocol !== PLUGIN_API_VERSION) return null;
  if (env.pluginId !== pluginId) return null;

  const type = env.message.type;
  if (typeof type !== "string" || !PLUGIN_MESSAGE_TYPES.has(type)) return null;
  if (!messageShapeOk(env.message)) return null;

  const needed = capabilityFor(type);
  if (needed && !capabilities.includes(needed)) return null;

  return env.message as unknown as PluginMessage;
}
