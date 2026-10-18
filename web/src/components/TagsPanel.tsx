import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, hiddenMatchers, isHiddenPath } from '../store';
import { searchApi, type VaultTag } from '../api';
import { useT } from '../i18n';
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconSearch,
  IconSortCount,
  IconSortName,
  IconSync,
} from './Icons';

// Nodo del árbol de etiquetas: proyecto → proyecto/web → proyecto/web/front
interface TagNode {
  name: string; // último segmento
  tag: string; // etiqueta completa
  paths: Set<string>; // notas con esta etiqueta o alguna subetiqueta
  children: Map<string, TagNode>;
}

type TagSort = 'name' | 'count';
const SORT_KEY = 'tagsSort';

function buildTagTree(tags: VaultTag[], visible: (path: string) => boolean) {
  const root: TagNode = { name: '', tag: '', paths: new Set(), children: new Map() };
  for (const { tag, paths } of tags) {
    const shown = paths.filter(visible);
    if (!shown.length) continue;
    let node = root;
    const parts = tag.split('/').filter(Boolean);
    parts.forEach((part, i) => {
      const key = part.toLowerCase();
      let child = node.children.get(key);
      if (!child) {
        child = { name: part, tag: parts.slice(0, i + 1).join('/'), paths: new Set(), children: new Map() };
        node.children.set(key, child);
      }
      shown.forEach((p) => child!.paths.add(p));
      node = child;
    });
  }
  return root;
}

// Con filtro: solo las etiquetas que lo contienen y las que llevan hasta ellas
const matchesFilter = (node: TagNode, filter: string): boolean =>
  node.tag.toLowerCase().includes(filter) || [...node.children.values()].some((c) => matchesFilter(c, filter));

function sortNodes(nodes: Iterable<TagNode>, sort: TagSort) {
  const byName = (a: TagNode, b: TagNode) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return [...nodes].sort(sort === 'count' ? (a, b) => b.paths.size - a.paths.size || byName(a, b) : byName);
}

interface NodeProps {
  node: TagNode;
  depth: number;
  sort: TagSort;
  filter: string;
  expanded: Set<string>;
  onToggle: (tag: string) => void;
}

function TagTreeNode({ node, depth, sort, filter, expanded, onToggle }: NodeProps) {
  const searchTag = useStore((s) => s.searchTag);
  const children = sortNodes(node.children.values(), sort).filter((c) => !filter || matchesFilter(c, filter));
  const isOpen = !!filter || expanded.has(node.tag.toLowerCase());

  return (
    <>
      <div
        className="tree-item tag-item"
        style={{ paddingLeft: depth * 16 }}
        title={`#${node.tag}`}
        onClick={() => searchTag(node.tag)}
      >
        <span
          className="tree-chevron"
          onClick={(e) => {
            if (!children.length) return;
            e.stopPropagation();
            onToggle(node.tag.toLowerCase());
          }}
        >
          {children.length > 0 && (isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />)}
        </span>
        <span className="tree-label">{node.name}</span>
        <span className="search-result-count">{node.paths.size}</span>
      </div>
      {isOpen &&
        children.map((c) => (
          <TagTreeNode
            key={c.tag}
            node={c}
            depth={depth + 1}
            sort={sort}
            filter={filter}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

export default function TagsPanel() {
  const hiddenFolders = useStore((s) => s.hiddenFolders);
  const [tags, setTags] = useState<VaultTag[] | null>(null);
  const [error, setError] = useState('');
  // Aviso de reintento por el límite del servidor; si falla con el árbol ya cargado, el árbol
  // se queda y el aviso va aparte (antes el error lo tapaba y además lo dejaba vacío)
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const t = useT();
  const abortRef = useRef<AbortController | null>(null);
  const [sort, setSort] = useState<TagSort>(() => {
    try {
      return localStorage.getItem(SORT_KEY) === 'count' ? 'count' : 'name';
    } catch {
      return 'name';
    }
  });

  const load = async () => {
    // Una nueva carga cancela la anterior (también una espera por `Retry-After`)
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setNotice('');
    try {
      const list = await searchApi.tags({
        signal: ctrl.signal,
        onWait: (ms) => setNotice(t('search.rateLimitedWait', { s: Math.max(1, Math.ceil(ms / 1000)) })),
      });
      if (ctrl.signal.aborted) return;
      setTags(list);
      setError('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const rateLimited = (err as Error).name === 'RateLimitError';
      // Con etiquetas ya cargadas se conservan: solo se avisa. Sin ellas, se muestra el error
      setError(
        rateLimited
          ? t('search.rateLimited', {
              s: Math.max(1, Math.ceil(((err as { retryAfterMs?: number }).retryAfterMs ?? 0) / 1000)),
            })
          : (err as Error).message,
      );
      if (!rateLimited) setTags(null);
    } finally {
      if (!ctrl.signal.aborted) setNotice('');
    }
  };

  // Solo al montar: luego se recarga con el botón
  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = () => {
    const next = sort === 'name' ? 'count' : 'name';
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // sin almacenamiento: el orden no se recuerda
    }
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const root = useMemo(() => {
    const matchers = hiddenMatchers(hiddenFolders);
    return buildTagTree(tags ?? [], (p) => !matchers.length || !isHiddenPath(p, false, matchers));
  }, [tags, hiddenFolders]);

  const f = filter.trim().replace(/^#/, '').toLowerCase();
  const roots = sortNodes(root.children.values(), sort).filter((n) => !f || matchesFilter(n, f));

  return (
    <>
      <div className="sidebar-toolbar">
        <button
          className="icon-btn"
          title={sort === 'name' ? t('tags.sortByCount') : t('tags.sortByName')}
          onClick={toggleSort}
        >
          {sort === 'name' ? <IconSortName size={16} /> : <IconSortCount size={16} />}
        </button>
        <button className="icon-btn" title={t('common.refresh')} onClick={load}>
          <IconSync size={16} />
        </button>
      </div>
      <div className="search-input-wrapper">
        <span className="search-input-icon">
          <IconSearch size={14} />
        </span>
        <input
          className="search-input"
          placeholder={t('tags.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
        />
        {filter && (
          <button className="icon-btn search-clear" title={t('common.clear')} onClick={() => setFilter('')}>
            <IconClose size={14} />
          </button>
        )}
      </div>
      <div className="file-explorer">
        {notice && <div className="search-summary-warning">{notice}</div>}
        {/* El error solo sustituye a la lista si no hay etiquetas que mostrar */}
        {error && tags === null ? (
          <div className="dropdown-empty">{error}</div>
        ) : tags === null ? (
          <div className="dropdown-empty">{t('common.loading')}</div>
        ) : roots.length === 0 ? (
          <div className="dropdown-empty">{f ? t('tags.noMatch') : t('tags.none')}</div>
        ) : (
          roots.map((n) => (
            <TagTreeNode key={n.tag} node={n} depth={0} sort={sort} filter={f} expanded={expanded} onToggle={toggle} />
          ))
        )}
      </div>
    </>
  );
}
