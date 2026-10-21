// Diff por palabras entre el texto original y el que devuelve la IA (algoritmo de Myers), para
// aplicar solo lo que cambia (el cursor y el scroll se conservan en el resto). Solo lo usa la barra
// de IA, así que se descarga con ella

export interface DiffOp {
  type: 'eq' | 'del' | 'ins';
  text: string;
}

// Palabras, espacios y signos sueltos: entre todos cubren el texto entero
const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

// Más cambios que estos (una reescritura completa) no compensan el coste del diff detallado:
// se marca todo el tramo como sustituido. La memoria crece con el cuadrado de este número
const MAX_EDITS = 1000;

type Op = [DiffOp['type'], string];

function myers(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d]: los valores de v antes del paso d, solo para las diagonales -d-1..d+1
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return [['del', a.join('')], ['ins', b.join('')]];

  // Se recorre el camino hacia atrás
  const out: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const get = (k: number) => prev[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const prevX = get(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) out.push(['eq', a[--x]]), y--;
    if (x === prevX) out.push(['ins', b[--y]]);
    else out.push(['del', a[--x]]);
  }
  while (x > 0 && y > 0) out.push(['eq', a[--x]]), y--;
  return out.reverse();
}

// Agrupa los cambios: los espacios sueltos entre dos cambios pasan a formar parte de ellos
// (si no, "a b c" → "x y z" saldría troceado palabra a palabra) y cada grupo queda como un
// borrado seguido de una inserción
function group(ops: Op[]): DiffOp[] {
  const result: DiffOp[] = [];
  let del = '';
  let ins = '';
  const flush = () => {
    if (del) result.push({ type: 'del', text: del });
    if (ins) result.push({ type: 'ins', text: ins });
    del = ins = '';
  };
  ops.forEach(([type, text], i) => {
    if (type === 'del') del += text;
    else if (type === 'ins') ins += text;
    else if ((del || ins) && !text.trim() && ops[i + 1] && ops[i + 1][0] !== 'eq') {
      del += text;
      ins += text;
    } else {
      flush();
      const last = result[result.length - 1];
      if (last?.type === 'eq') last.text += text;
      else result.push({ type: 'eq', text });
    }
  });
  flush();
  return result.filter((op) => op.text);
}

export function diffText(a: string, b: string): DiffOp[] {
  const ta = a.match(TOKEN) ?? [];
  const tb = b.match(TOKEN) ?? [];
  // El principio y el final comunes se separan antes: suelen ser casi todo el texto
  let start = 0;
  while (start < ta.length && start < tb.length && ta[start] === tb[start]) start++;
  let endA = ta.length;
  let endB = tb.length;
  while (endA > start && endB > start && ta[endA - 1] === tb[endB - 1]) {
    endA--;
    endB--;
  }
  return group([
    ['eq', ta.slice(0, start).join('')],
    ...myers(ta.slice(start, endA), tb.slice(start, endB)),
    ['eq', ta.slice(endA).join('')],
  ]);
}
