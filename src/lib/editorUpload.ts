import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Témoin d'upload d'image collée : une décoration (donc hors document, pas de
// texte parasite dans le Markdown) posée à l'endroit du collage, et dont la
// position suit les frappes suivantes. À la fin de l'upload, on retrouve où
// insérer l'image même si l'utilisateur a continué à écrire ailleurs, et deux
// collages simultanés ne se marchent pas dessus (chaque témoin a son id).

export const uploadPlaceholderKey = new PluginKey<DecorationSet>("uploadPlaceholder");

interface AddAction {
  id: object;
  pos: number;
  label: string;
}

interface UploadMeta {
  add?: AddAction;
  remove?: { id: object };
}

export const UploadPlaceholder = Extension.create({
  name: "uploadPlaceholder",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: uploadPlaceholderKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(uploadPlaceholderKey) as UploadMeta | undefined;
            if (meta?.add) {
              const widget = document.createElement("em");
              widget.className = "trk-md-upload-placeholder";
              widget.textContent = meta.add.label;
              next = next.add(tr.doc, [
                Decoration.widget(meta.add.pos, widget, { id: meta.add.id }),
              ]);
            }
            if (meta?.remove) {
              const { id } = meta.remove;
              next = next.remove(next.find(undefined, undefined, (spec) => spec.id === id));
            }
            return next;
          },
        },
        props: {
          decorations: (state) => uploadPlaceholderKey.getState(state),
        },
      }),
    ];
  },
});

export function addUploadPlaceholder(state: EditorState, id: object, label: string) {
  return state.tr.setMeta(uploadPlaceholderKey, {
    add: { id, pos: state.selection.from, label },
  } satisfies UploadMeta);
}

export function removeUploadPlaceholder(state: EditorState, id: object) {
  return state.tr.setMeta(uploadPlaceholderKey, { remove: { id } } satisfies UploadMeta);
}

// Position courante du témoin, ou null s'il a disparu entre-temps (undo,
// suppression du paragraphe qui le portait…).
export function findUploadPlaceholder(state: EditorState, id: object): number | null {
  const set = uploadPlaceholderKey.getState(state);
  const found = set?.find(undefined, undefined, (spec) => spec.id === id);
  return found?.length ? found[0]!.from : null;
}
