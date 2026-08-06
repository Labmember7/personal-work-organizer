import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Color, FontFamily, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { ResizableImage } from "./editorImage";
import { UploadPlaceholder } from "./editorUpload";

// Jeu d'extensions de l'éditeur de description (Tiptap). Il couvre exactement
// ce que la barre d'outils propose, plus ce que la syntaxe Markdown relue par
// renderMarkdown peut produire (titres jusqu'à h6, tableaux, images
// dimensionnées) : une balise absente du schéma serait silencieusement perdue
// à l'ouverture de la tâche.
// Les libellés sont passés en fonctions : l'éditeur n'est créé qu'une fois,
// mais la langue peut changer entre-temps.

interface EditorExtensionsOptions {
  placeholder: () => string;
  resizeHint: () => string;
}

export function createEditorExtensions({ placeholder, resizeHint }: EditorExtensionsOptions): Extensions {
  return [
    StarterKit.configure({
      // Un lien cliquable ouvrirait la cible dans la fenêtre Electron
      // elle-même : en édition, un clic doit seulement placer le curseur.
      link: { openOnClick: false },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Colonnes non redimensionnables : le Markdown ne sait pas mémoriser une
    // largeur de colonne, elle serait perdue à la prochaine ouverture.
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Color,
    FontFamily,
    ResizableImage.configure({ inline: true, resizeHint }),
    Placeholder.configure({ placeholder: () => placeholder() }),
    UploadPlaceholder,
  ];
}
