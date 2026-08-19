import React, { useMemo } from "react";
import { localized } from "../../lib/plugins/manifest";
import { parse, evaluate } from "../../lib/plugins/trkx";

// Rendu d'une vue déclarative (`trk.view/1`) : le plugin ne fournit qu'un
// fichier de spécification, tout le rendu est celui de l'hôte. Ni iframe, ni
// origine, ni CSP, ni postMessage — il n'y a rien à confiner, une expression
// `trkx` ne peut que produire une valeur.
//
// Preuve de concept : uniquement `layout.type === "table"`, uniquement
// `source: tasks`. Les autres dispositions (cards, board, timeline, chart)
// réutiliseraient les mêmes composants que le reste de l'app.

const cell = (expr, ctx) => {
  const ast = typeof expr === "string" ? parse(expr) : null;
  return ast ? evaluate(ast, ctx) : null;
};

const text = (v) => (v === null || v === undefined ? "—" : String(v));

function Cell({ col, ctx }) {
  const value = cell(col.value, ctx);
  const style = { textAlign: col.align === "right" ? "right" : "left" };

  if (col.as === "gauge") {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    return (
      <td style={style}>
        <div className="trk-dv-gauge" title={`${pct} %`}>
          <div className="trk-dv-gauge-fill" style={{ width: `${pct}%` }} />
          <span>{pct} %</span>
        </div>
      </td>
    );
  }

  if (col.as === "badge") {
    const tone = cell(col.tone, ctx) ?? "muted";
    return (
      <td style={style}>
        <span className={`trk-dv-badge trk-dv-badge--${tone === "danger" ? "danger" : "muted"}`}>{text(value)}</span>
      </td>
    );
  }

  return <td style={style}>{text(value)}</td>;
}

export function DeclarativeView({ spec, snapshot, lang, rows: providedRows, settings }) {
  const computed = useMemo(() => {
    const base = { now: new Date().toISOString().slice(0, 10), lang };
    const all = snapshot?.tasks ?? [];

    const kept = spec.where ? all.filter((task) => cell(spec.where, { ...base, ...task, task }) === true) : all;

    // Regroupement : chaque ligne devient { group, items }, la forme que les
    // colonnes attendent (cf. § Portées de docs/plugins/trkx-langage.md).
    let list;
    if (spec.group) {
      const buckets = new Map();
      for (const task of kept) {
        const key = text(cell(spec.group, { ...base, ...task, task }));
        const bucket = buckets.get(key);
        if (bucket) bucket.push(task);
        else buckets.set(key, [task]);
      }
      list = [...buckets.entries()].map(([group, items]) => ({ ...base, group, items }));
    } else {
      list = kept.map((task) => ({ ...base, ...task, task }));
    }

    // Le tri est une expression : `-sum(items, 'minutes')` décroît, grâce à
    // l'unaire `-` du langage. Pas de mot-clé `desc` à inventer.
    if (spec.sort) {
      list = [...list].sort((a, b) => (Number(cell(spec.sort, a)) || 0) - (Number(cell(spec.sort, b)) || 0));
    }
    return { base, kept, list };
  }, [spec, snapshot, lang]);

  // Un panneau de tâche fournit ses propres lignes (ex. la tâche courante) :
  // on court-circuite la dérivation depuis le snapshot.
  const base = providedRows ? {} : computed.base;
  const kept = providedRows ? providedRows : computed.kept;
  const list = providedRows ? providedRows : computed.list;
  const settingsCtx = settings ?? {};

  const columns = spec.layout?.columns ?? [];

  if (list.length === 0) {
    return <div className="trk-empty">{localized(spec.empty, lang) || "—"}</div>;
  }

  const footerCtx = { ...base, tasks: kept, settings: settingsCtx };

  return (
    <div className="trk-dv">
      <table className="trk-dv-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ width: col.width, textAlign: col.align === "right" ? "right" : "left" }}>
                {localized(col.label, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((ctx, r) => (
            <tr key={r}>
              {columns.map((col, i) => (
                <Cell
                  key={i}
                  col={col}
                  ctx={{ ...ctx, settings: { ...(typeof ctx.settings === "object" && ctx.settings ? ctx.settings : {}), ...settingsCtx } }}
                />
              ))}
            </tr>
          ))}
        </tbody>
        {spec.layout?.footer && (
          <tfoot>
            <tr>
              {spec.layout.footer.map((col, i) => (
                <Cell key={i} col={col} ctx={footerCtx} />
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
