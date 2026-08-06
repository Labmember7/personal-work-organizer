import Image, { type ImageOptions } from "@tiptap/extension-image";
import type { NodeViewRendererProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// Image de l'éditeur augmentée d'une largeur figée et d'une poignée de
// redimensionnement (coin bas-droit), comme dans un traitement de texte : la
// largeur part dans un attribut HTML `width`, que htmlToMarkdown.ts conserve
// en `<img>` brut dans la source Markdown (le Markdown seul ne sait pas
// exprimer une taille). La hauteur reste automatique.

const MIN_WIDTH = 60;
const IMAGE_ATTRIBUTES = ["src", "alt", "title", "width"] as const;

export interface ResizableImageOptions extends ImageOptions {
  /** Infobulle de la poignée, relue à chaque peinture (changement de langue). */
  resizeHint: () => string;
}

// Vue de nœud : le DOM est à nous, ProseMirror ne le relit pas (voir
// ignoreMutation) - le glisser peut donc poser une largeur en direct sans
// polluer le document, seul le relâchement écrit l'attribut.
function resizableImageView(
  { node, editor, getPos }: NodeViewRendererProps,
  resizeHint: () => string
) {
  let current = node as ProseMirrorNode;
  let stopDrag: (() => void) | null = null;

  const wrap = document.createElement("span");
  wrap.className = "trk-img-resizable";
  const img = document.createElement("img");
  const handle = document.createElement("span");
  handle.className = "trk-img-resize-handle";
  handle.setAttribute("aria-hidden", "true");
  wrap.append(img, handle);

  const paint = (target: ProseMirrorNode) => {
    wrap.title = resizeHint();
    img.style.width = "";
    IMAGE_ATTRIBUTES.forEach((name) => {
      const value = target.attrs[name];
      if (value) img.setAttribute(name, String(value));
      else img.removeAttribute(name);
    });
  };
  paint(current);

  const startResize = (event: MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const maxWidth = editor.view.dom.clientWidth || Infinity;
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    const onMove = (moved: MouseEvent) => {
      const next = Math.min(maxWidth, Math.max(MIN_WIDTH, Math.round(startWidth + moved.clientX - startX)));
      img.style.width = `${next}px`;
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      stopDrag = null;
    };
    const onUp = () => {
      const width = Math.round(img.getBoundingClientRect().width);
      cleanup();
      const pos = getPos();
      if (typeof pos !== "number") return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width }));
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    stopDrag = cleanup;
  };

  handle.addEventListener("mousedown", startResize);

  return {
    dom: wrap,
    update: (updated: ProseMirrorNode) => {
      if (updated.type.name !== current.type.name) return false;
      current = updated;
      paint(updated);
      return true;
    },
    // La poignée n'est pas du contenu : ProseMirror ne doit ni en faire une
    // sélection de nœud, ni relire le DOM que le glisser modifie.
    stopEvent: (event: Event) => event.target === handle,
    ignoreMutation: () => true,
    // Le composant peut être démonté en pleine poignée (fermeture de la
    // modale) : sans ça les écouteurs resteraient sur window.
    destroy: () => stopDrag?.(),
  };
}

export const ResizableImage = Image.extend<ResizableImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      resizeHint: () => "",
    } as ResizableImageOptions;
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
      },
    };
  },

  addNodeView() {
    return (props) => resizableImageView(props, () => this.options.resizeHint());
  },
});
