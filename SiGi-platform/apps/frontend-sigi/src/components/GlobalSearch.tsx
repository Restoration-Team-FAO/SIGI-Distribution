import type { GlobalSearchItem, GlobalSearchResultType } from '@sigi/domain';
import { useEffect, useId, useMemo, useState } from 'react';
import { canAccessCapability } from '../app/capabilities';
import { useEgi } from '../contexts/EgiContext';
import { workspaceApi } from '../services/api';

const TYPE_LABELS: Record<GlobalSearchResultType, string> = {
  project: 'Proyectos',
  indicator: 'Indicadores',
  report: 'Informes',
  file: 'Documentos',
};

export function GlobalSearch(props: { onNavigate: (path: string) => void }) {
  const { activeEgiId, currentUser, globalViewScope } = useEgi();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GlobalSearchItem[]>([]);
  const [omittedTypes, setOmittedTypes] = useState<GlobalSearchResultType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const resultsId = useId();
  const canSearch = canAccessCapability({
    permissions: ['projects.read', 'indicators.read', 'reports.read', 'files.read'],
    permissionMatch: 'any',
  }, currentUser);

  useEffect(() => {
    let cancelled = false;
    const normalized = query.trim();
    if (!canSearch || !activeEgiId || normalized.length < 2) {
      setItems([]);
      setOmittedTypes([]);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void workspaceApi.globalSearch(normalized, globalViewScope)
        .then((response) => {
          if (!cancelled) {
            setItems(response.data.items);
            setOmittedTypes(response.data.omittedTypes);
            setIsOpen(true);
          }
        })
        .catch((reason) => {
          if (!cancelled) {
            setItems([]);
            setOmittedTypes([]);
            setError(reason instanceof Error ? reason.message : String(reason));
            setIsOpen(true);
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeEgiId, canSearch, globalViewScope, query]);

  const groups = useMemo(() => {
    const grouped = new Map<GlobalSearchResultType, GlobalSearchItem[]>();
    items.forEach((item) => grouped.set(item.type, [...(grouped.get(item.type) ?? []), item]));
    return Array.from(grouped.entries());
  }, [items]);

  if (!canSearch) return null;

  function openResult(item: GlobalSearchItem) {
    setIsOpen(false);
    setQuery('');
    props.onNavigate(item.path);
  }

  return (
    <div
      className="sigi-global-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setIsOpen(false);
      }}
    >
      <label className="sigi-global-search__input">
        <span className="sigi-visually-hidden">Buscar en SIGI</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder={activeEgiId ? 'Buscar en SIGI…' : 'Selecciona un EGI para buscar'}
          disabled={!activeEgiId}
          aria-controls={resultsId}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(event.target.value.trim().length >= 2);
          }}
        />
        {isLoading ? <span className="sigi-global-search__loading" aria-label="Buscando" /> : null}
      </label>

      {isOpen && query.trim().length >= 2 ? (
        <div id={resultsId} className="sigi-global-search__panel" role="listbox" aria-label="Resultados de búsqueda">
          {error ? <p className="sigi-global-search__state">No fue posible completar la búsqueda.</p> : null}
          {!error && !isLoading && groups.length === 0 ? <p className="sigi-global-search__state">Sin resultados en tu alcance.</p> : null}
          {groups.map(([type, results]) => (
            <section key={type} className="sigi-global-search__group" aria-label={TYPE_LABELS[type]}>
              <strong>{TYPE_LABELS[type]}</strong>
              {results.map((item) => (
                <button key={`${item.type}-${item.id}`} type="button" role="option" onClick={() => openResult(item)}>
                  <span>{item.title}</span>
                  <small>{[item.code, item.subtitle, item.status].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </section>
          ))}
          {globalViewScope === 'global' && omittedTypes.length > 0 ? (
            <p className="sigi-global-search__scope-note">
              Informes y documentos requieren volver al alcance «EGI activo».
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
