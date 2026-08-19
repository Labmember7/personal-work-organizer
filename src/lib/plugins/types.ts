// Contrat du système de plugins : manifeste, format de document et protocole
// de messages hôte <-> plugin.
//
// Un plugin est UN fichier HTML autonome déposé dans `plugins/`. Il est chargé
// dans une iframe `sandbox="allow-scripts"` (origine opaque : pas de DOM
// parent, pas de stockage, pas de réseau) et ne communique avec l'app que par
// `postMessage`. Tout ce qu'il reçoit lui est envoyé explicitement par l'hôte,
// en fonction des capacités déclarées dans son manifeste.

/** Version du protocole. Incrémentée à chaque rupture de compatibilité. */
export const PLUGIN_API_VERSION = 1;

/** Espace de nommage des messages : filtre le bruit des autres iframes/extensions. */
export const PLUGIN_MESSAGE_NS = "trk.plugin";

// ── Manifeste ──────────────────────────────────────────────────────────────

/**
 * Ce qu'un plugin est autorisé à demander. L'hôte n'envoie une donnée que si
 * la capacité correspondante est déclarée, et ignore tout message entrant
 * dont la capacité n'a pas été accordée : le manifeste est la seule surface
 * d'autorisation.
 */
export type PluginCapability =
  | "doc" // charger et enregistrer son propre document
  | "tasks:read" // recevoir la projection en lecture seule des tâches et projets
  | "task:reveal" // demander l'ouverture d'une tâche dans l'app
  | "file:save" // demander l'enregistrement d'un fichier (export)
  | "toast" // afficher un message dans l'app
  | "fullscreen" // demander que le cadre du plugin recouvre toute la fenêtre
  | "debug"; // relayer ses console.log/warn/error vers la console de débogage de l'hôte

export const PLUGIN_CAPABILITIES: readonly PluginCapability[] = [
  "doc",
  "tasks:read",
  "task:reveal",
  "file:save",
  "toast",
  "fullscreen",
  "debug",
];

/** Libellé traduit : `{ fr, en }`, ou une simple chaîne si le plugin est monolingue. */
export type LocalizedText = string | Partial<Record<string, string>>;

/** Portées possibles d'un document (global, ou rattaché à un projet). */
export type PluginScopeKind = "global" | "project";

export interface PluginManifest {
  /** Identifiant stable, sert de préfixe aux clés de stockage. `[a-z0-9-]`. */
  id: string;
  version: string;
  /** Version du protocole attendue. Refusé si > PLUGIN_API_VERSION. */
  apiVersion: number;
  name: LocalizedText;
  description?: LocalizedText;
  /** Nom d'icône lucide-react (ex. "Network"). Repli : "Puzzle". */
  icon?: string;
  capabilities: PluginCapability[];
  /** Portées supportées. Défaut : les deux. */
  scopes?: PluginScopeKind[];
  /** Vrai si le plugin ne gère qu'un seul document (pas de liste). */
  singleton?: boolean;
}

/** Un plugin découvert : son manifeste, où le charger, d'où il vient. */
export interface PluginSource {
  manifest: PluginManifest;
  /** URL à donner à l'iframe (v1) ; vide pour un plugin v2 déclaratif. */
  url: string;
  /** `builtin` = livré avec l'app ; `user` = déposé dans `plugins/` par l'utilisateur. */
  origin: "builtin" | "user";
  /** Nom de fichier, pour les diagnostics. */
  file: string;
  /** `1` = fichier HTML autonome (apiVersion v1) ; `2` = dossier `trk.extension/2`. */
  format: 1 | 2;
  /** Racine du dossier du plugin sur disque (v2) ; absente pour v1. */
  root?: string;
  /**
   * Format `trk.extension/2` : spécification `trk.view/1` d'une vue déclarative,
   * rendue par l'hôte au lieu d'être chargée dans une iframe. Absente pour un
   * plugin v1 (un fichier .html), qui garde `url`.
   */
  declarative?: Record<string, unknown>;
}

/** Plugin trouvé mais inutilisable (manifeste invalide, API trop récente). */
export interface PluginLoadError {
  file: string;
  origin: "builtin" | "user";
  reason:
    | "no-manifest"
    | "invalid-json"
    | "invalid-manifest"
    | "api-too-new"
    | "engine-mismatch"
    | "not-v2"
    | "unreadable";
  detail?: string;
}

// ── Format de document ─────────────────────────────────────────────────────

export const PLUGIN_DOC_SCHEMA = "trk.plugin.doc/1";

export type PluginDocScope = { kind: "global" } | { kind: "project"; project: string };

/**
 * Référence vers une entité de l'app. Générique à dessein : un plugin y pointe
 * sans connaître le modèle interne, et l'hôte reste libre d'ajouter des genres.
 * Les liens sont en **lecture seule** : un plugin ne crée ni ne modifie jamais
 * de tâche, il ne fait que référencer et afficher.
 */
export interface EntityRef {
  kind: "task" | "project";
  id: string;
}

/**
 * Enveloppe commune à TOUS les plugins. Seul `data` est propre au plugin ;
 * l'hôte n'y touche jamais et le traite comme opaque. C'est ce qui rend le
 * stockage, la liste des documents, la portée projet et les liens vers les
 * tâches réutilisables sans une ligne de code par plugin.
 */
export interface PluginDocument<TData = unknown> {
  schema: typeof PLUGIN_DOC_SCHEMA;
  pluginId: string;
  /** Version du plugin qui a écrit le document (diagnostic). */
  pluginVersion?: string;
  /** Version du format de `data`, gérée par le plugin pour ses migrations. */
  dataVersion: number;
  id: string;
  title: string;
  scope: PluginDocScope;
  /** Entités de l'app référencées par le document (lecture seule). */
  refs: EntityRef[];
  createdAt: string;
  updatedAt: string;
  data: TData;
}

/** Entrée de la liste des documents (sans la charge utile, pour l'affichage). */
export interface PluginDocSummary {
  id: string;
  pluginId: string;
  title: string;
  scope: PluginDocScope;
  updatedAt: string;
  refCount: number;
}

// ── Projections en lecture seule ───────────────────────────────────────────

/**
 * Vue d'une tâche transmise aux plugins. Les libellés et couleurs de statut et
 * de priorité sont **résolus par l'hôte** : un plugin affiche l'état réel de
 * l'app sans dupliquer `lib/statuses.ts`, et suit automatiquement une
 * évolution du référentiel.
 */
export interface TaskProjection {
  id: string;
  titre: string;
  projet: string;
  statut: string;
  statutLabel: string;
  statutColor: string;
  /** Avancement du statut, 0-100. */
  weight: number;
  priorite: string;
  prioriteLabel: string;
  prioriteColor: string;
  assigne: string;
  dateDebut: string;
  echeance: string;
  archived: boolean;
  done: boolean;
  /** Total pointé, en minutes. */
  minutes: number;
}

export interface HostSnapshot {
  tasks: TaskProjection[];
  projects: string[];
}

/** Jetons de thème transmis au plugin pour qu'il suive l'apparence de l'app. */
export interface HostTheme {
  name: string;
  dark: boolean;
  tokens: Record<string, string>;
}

// ── Messages : hôte -> plugin ──────────────────────────────────────────────

export interface HostInitMessage {
  type: "host:init";
  apiVersion: number;
  plugin: { id: string; version: string };
  lang: string;
  /** Libellés de l'app réutilisables par le plugin (clés `plugin_*`). */
  dict: Record<string, string>;
  theme: HostTheme;
  capabilities: PluginCapability[];
  doc: PluginDocument | null;
  snapshot: HostSnapshot | null;
}

export type HostMessage =
  | HostInitMessage
  | { type: "host:doc"; doc: PluginDocument | null }
  | { type: "host:snapshot"; snapshot: HostSnapshot }
  | { type: "host:theme"; theme: HostTheme }
  | { type: "host:lang"; lang: string; dict: Record<string, string> }
  | { type: "host:saved"; at: string }
  | { type: "host:error"; code: string; message: string }
  /** L'hôte a changé l'état plein écran de son propre chef (ex. bouton de
   * sortie côté hôte, Échap) : le plugin recale son affichage sans que ce
   * soit lui qui ait initié le changement via `requestFullscreen`. */
  | { type: "host:fullscreen"; on: boolean };

// ── Messages : plugin -> hôte ──────────────────────────────────────────────

/** Ce qu'un plugin peut demander d'écrire. L'hôte reconstruit l'enveloppe. */
export interface PluginDocPatch {
  data: unknown;
  dataVersion?: number;
  title?: string;
  refs?: EntityRef[];
}

export type PluginMessage =
  | { type: "plugin:ready"; apiVersion: number }
  | { type: "plugin:doc:save"; patch: PluginDocPatch }
  | { type: "plugin:dirty"; dirty: boolean }
  | { type: "plugin:snapshot:refresh" }
  | { type: "plugin:task:reveal"; id: string }
  | { type: "plugin:toast"; message: string }
  | { type: "plugin:file:save"; name: string; mime: string; base64?: string; text?: string }
  | { type: "plugin:fullscreen"; on: boolean }
  /** Diagnostic uniquement : un `console.log/warn/error` (ou une erreur non
   * interceptée) fait dans l'iframe, relayé vers la console de débogage de
   * l'hôte — invisible autrement, l'iframe sandboxée n'a pas de devtools
   * facilement accessible depuis l'app. Texte déjà aplati côté SDK. */
  | { type: "plugin:log"; level: "log" | "info" | "warn" | "error"; args: string[] };

/** Enveloppe transportée par postMessage, dans les deux sens. */
export interface PluginEnvelope<M = HostMessage | PluginMessage> {
  ns: typeof PLUGIN_MESSAGE_NS;
  protocol: number;
  /** Identifiant du plugin destinataire/émetteur (garde contre les mélanges). */
  pluginId: string;
  message: M;
}
