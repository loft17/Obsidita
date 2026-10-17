import { useState, useEffect, useRef } from 'react';
import { useStore, hiddenMatchers, isHiddenPath } from '../store';
import { searchApi, SearchResult, SearchMatch } from '../api';
import { useT } from '../i18n';
import { setPendingLine } from '../wikilinks';
import { IconChevronRight, IconChevronDown, IconClose, IconSearch } from './Icons';

// Segundos exagerados no se anuncian (p. ej. 3600); el aviso pasa a ser genérico
const MAX_ANNOUNCED_WAIT = 5 * 60;

function Highlighted({ text, start, length }: Pick<SearchMatch, 'text' | 'start' | 'length'>) {
  return (
    <>
      {text.slice(0, start)}
      <mark className="search-highlight">{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  );
}

// Resalta la primera aparición de `query` dentro del nombre
function HighlightedName({ name, query }: { name: string; query: string }) {
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{name}</>;
  return <Highlighted text={name} start={idx} length={query.length} />;
}

export default function SearchPanel() {
  const hiddenFolders = useStore((s) => s.hiddenFolders);
  const activeTab = useStore((s) => s.activeTab);
  const openFile = useStore((s) => s.openFile);
  const query = useStore((s) => s.searchQuery);
  const setQuery = useStore((s) => s.setSearchQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Segundos de espera anunciados por un 429: mientras se espera a reintentar no se pierden
  // los resultados ya mostrados
  const [waiting, setWaiting] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Último resultado correcto; si la nueva búsqueda falla se sigue mostrando lo anterior
  const hasResults = useRef(false);
  const t = useT();

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError('');
      setWaiting(0);
      setLoading(false);
      hasResults.current = false;
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    setWaiting(0);
    // Espera a que se deje de escribir antes de consultar al servidor
    const timer = setTimeout(async () => {
      try {
        const found = await searchApi.search(q, ctrl.signal, {
          // Ante un 429 se espera lo que indique `Retry-After` y se repite una vez; durante la
          // espera se dice cuánto falta en vez de vaciar la lista
          onWait: (ms) => setWaiting(Math.max(1, Math.ceil(ms / 1000))),
        });
        if (ctrl.signal.aborted) return;
        hasResults.current = found.length > 0;
        setResults(found);
        setCollapsed(new Set());
        setError('');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const rateLimited = (err as Error).name === 'RateLimitError';
        const retryAfter = (err as { retryAfterMs?: number }).retryAfterMs ?? 0;
        // Si ya había resultados, se conservan y solo se avisa; sin ellos, se muestra el error
        // (un fallo real del servidor o el límite sin resultados previos)
        if (!(rateLimited && hasResults.current)) setResults([]);
        setError(
          rateLimited
            ? t('search.rateLimited', { s: retryAfter > 0 ? Math.max(1, Math.ceil(retryAfter / 1000)) : 60 })
            : (err as Error).message
        );
      }
      setWaiting(0);
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, t]);

  const matchers = hiddenMatchers(hiddenFolders);
  const visible = matchers.length ? results.filter((r) => !isHiddenPath(r.path, false, matchers)) : results;
  const totalMatches = visible.reduce((n, r) => n + r.total, 0);
  const q = query.trim();
  const summary = `${t(visible.length === 1 ? 'search.file' : 'search.files', { n: visible.length })} · ${t(
    totalMatches === 1 ? 'search.match' : 'search.matches',
    { n: totalMatches }
  )}`;
  // Los resultados viejos se mantienen visibles aunque el aviso esté debajo
  const showingStale = visible.length > 0 && !!error;

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <>
      <div className="search-input-wrapper">
        <span className="search-input-icon">
          <IconSearch size={14} />
        </span>
        <input
          autoFocus
          className="search-input"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
        {query && (
          <button className="icon-btn search-clear" title={t('common.clear')} onClick={() => setQuery('')}>
            <IconClose size={14} />
          </button>
        )}
      </div>
      {q && (
        <div className="search-summary">
          {loading ? (
            waiting > 0
              ? t('search.rateLimitedWait', { s: waiting })
              : t('search.searching')
          ) : error ? (
            showingStale ? (
              <>
                {summary}
                <div className="search-summary-warning">{error}</div>
              </>
            ) : (
              error
            )
          ) : (
            summary
          )}
        </div>
      )}
      <div className="file-explorer search-results">
        {!loading && q && !error && visible.length === 0 && <div className="dropdown-empty">{t('search.noResults')}</div>}        {visible.map((r) => {
          const isOpen = !collapsed.has(r.path);
          const hasMatches = r.matches.length > 0;
          return (
            <div key={r.path} className="search-result">
              <div
                className={`tree-item file ${activeTab === r.path ? 'active' : ''}`}
                style={{ paddingLeft: hasMatches ? '0' : '16px' }}
                title={r.path}
                onClick={() => {
                  if (r.matches.length > 0) setPendingLine(r.path, r.matches[0].line);
                  openFile(r.path, r.name);
                }}
              >
                {hasMatches && (
                  <span
                    className="tree-chevron"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.path);
                    }}
                  >
                    {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </span>
                )}
                <span className="tree-label">
                  <HighlightedName name={r.name.replace(/\.md$/i, '')} query={q} />
                  {r.path.includes('/') && (
                    <span className="search-result-folder">{r.path.substring(0, r.path.lastIndexOf('/'))}</span>
                  )}
                </span>
                {r.total > 0 && <span className="search-result-count">{r.total}</span>}
              </div>
              {hasMatches && isOpen && (
                <div className="search-matches">
                  {r.matches.map((m, i) => (
                    <div
                      key={i}
                      className="search-match"
                      title={t('search.line', { n: m.line })}
                      onClick={() => {
                        setPendingLine(r.path, m.line);
                        openFile(r.path, r.name);
                      }}
                    >
                      <Highlighted text={m.text} start={m.start} length={m.length} />
                    </div>
                  ))}
                  {r.total > r.matches.length && (
                    <div className="search-match-more">{t('search.more', { n: r.total - r.matches.length })}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
