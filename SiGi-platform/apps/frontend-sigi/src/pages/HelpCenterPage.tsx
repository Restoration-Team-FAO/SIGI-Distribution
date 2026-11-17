import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DetailList,
  MessageBlock,
  Panel,
  PanelGrid,
  StatPill,
} from '../components/section-kit';
import {
  audienceLabels,
  buildHelpKnowledgeManifest,
  contentTypeLabels,
  helpArticles,
  helpFaqItems,
  helpLearningPaths,
  helpResources,
  helpSidebarSections,
  moduleLabels,
  type HelpArticle,
  type HelpAudience,
} from '../help/content';

const VIEWED_STORAGE_KEY = 'sigi.help.viewed.v1';
const USEFUL_STORAGE_KEY = 'sigi.help.useful.v1';
const SIDEBAR_STORAGE_KEY = 'sigi.help.sidebar.v1';
type HelpMetricListId = 'published' | 'ai-ready' | 'paths' | 'progress';
type HelpHomeView = 'overview' | 'articles' | 'paths' | 'faq' | 'resources' | 'recent';

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function loadSet(storageKey: string) {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

function saveSet(storageKey: string, values: Set<string>) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(Array.from(values)));
}

function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.reject(new Error('Clipboard no disponible.'));
}

export function HelpCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [audienceFilter, setAudienceFilter] = useState<HelpAudience | 'all'>('all');
  const [viewedArticles, setViewedArticles] = useState<Set<string>>(() => loadSet(VIEWED_STORAGE_KEY));
  const [usefulArticles, setUsefulArticles] = useState<Set<string>>(() => loadSet(USEFUL_STORAGE_KEY));
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const stored = loadSet(SIDEBAR_STORAGE_KEY);
    return stored.size > 0 ? stored : new Set<string>();
  });
  const [openMetricList, setOpenMetricList] = useState<HelpMetricListId | null>(null);
  const [activeHomeView, setActiveHomeView] = useState<HelpHomeView>('overview');
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSlug = searchParams.get('article');
  const selectedArticle =
    helpArticles.find((article) => article.slug === selectedSlug) ?? null;
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!selectedArticle) {
      return;
    }
    setViewedArticles((current) => {
      const next = new Set(current);
      next.add(selectedArticle.slug);
      saveSet(VIEWED_STORAGE_KEY, next);
      return next;
    });
  }, [selectedArticle]);

  useEffect(() => {
    saveSet(SIDEBAR_STORAGE_KEY, openSections);
  }, [openSections]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedSlug]);

  function openArticle(slug: string) {
    setOpenMetricList(null);
    const next = new URLSearchParams(searchParams);
    next.set('article', slug);
    if (search.trim()) {
      next.set('q', search.trim());
    }
    setSearchParams(next);
  }

  function goHome() {
    const next = new URLSearchParams(searchParams);
    next.delete('article');
    if (!search.trim()) {
      next.delete('q');
    }
    setSearchParams(next);
  }

  function switchHomeView(nextView: HelpHomeView) {
    setActiveHomeView(nextView);
    setOpenMetricList(null);
    if (selectedArticle) {
      goHome();
    }
  }

  function updateSearch(value: string) {
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) {
      next.set('q', value.trim());
    } else {
      next.delete('q');
    }
    setSearchParams(next, { replace: true });
  }

  function toggleSection(sectionId: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  function markUseful(slug: string) {
    setUsefulArticles((current) => {
      const next = new Set(current);
      if (next.has(slug)) {
        next.delete(slug);
        setNotice('La guía dejó de estar marcada como útil en este navegador.');
      } else {
        next.add(slug);
        setNotice('Guía marcada como útil.');
      }
      saveSet(USEFUL_STORAGE_KEY, next);
      return next;
    });
  }

  async function handleCopyLink(slug: string) {
    const url = `${window.location.origin}/admin/help?article=${encodeURIComponent(slug)}`;
    try {
      await copyText(url);
      setNotice('Enlace copiado al portapapeles.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo copiar el enlace.');
    }
  }

  function handleDownloadKnowledge() {
    const blob = new Blob([JSON.stringify(buildHelpKnowledgeManifest(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sigi-help-knowledge-manifest.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Manifiesto IA generado.');
  }

  const searchQuery = normalizeText(deferredSearch.trim());
  const filteredArticles = useMemo(
    () =>
      helpArticles.filter((article) => {
        if (audienceFilter !== 'all' && !article.audience.includes(audienceFilter)) {
          return false;
        }
        if (!searchQuery) {
          return true;
        }
        const haystack = normalizeText(
          [
            article.title,
            article.summary,
            article.content,
            article.tags.join(' '),
            article.keywords.join(' '),
            article.sections.map((section) => `${section.title} ${section.body.join(' ')} ${section.steps?.join(' ') ?? ''}`).join(' '),
          ].join(' '),
        );
        return haystack.includes(searchQuery);
      }),
    [audienceFilter, searchQuery],
  );

  const filteredArticleSlugs = new Set(filteredArticles.map((article) => article.slug));
  const selectedSection =
    selectedArticle
      ? helpSidebarSections.find((section) => section.articleSlugs.includes(selectedArticle.slug)) ?? null
      : null;
  const selectedSectionArticles = selectedSection
    ? selectedSection.articleSlugs
        .map((slug) => helpArticles.find((article) => article.slug === slug) ?? null)
        .filter((article): article is HelpArticle => article !== null)
    : [];
  const selectedArticleIndex = selectedArticle
    ? selectedSectionArticles.findIndex((article) => article.slug === selectedArticle.slug)
    : -1;
  const previousArticle =
    selectedArticleIndex > 0 ? selectedSectionArticles[selectedArticleIndex - 1] : null;
  const nextArticle =
    selectedArticleIndex >= 0 && selectedArticleIndex < selectedSectionArticles.length - 1
      ? selectedSectionArticles[selectedArticleIndex + 1]
      : null;
  const latestArticles = [...helpArticles]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);
  const faqArticles = filteredArticles.filter((article) => article.contentType === 'faq');
  const publishedArticles = helpArticles.filter((article) => article.status === 'published');
  const aiReadyArticles = helpArticles.filter((article) => article.aiEnabled);
  const viewedArticleList = helpArticles.filter((article) => viewedArticles.has(article.slug));
  const searchDrivenView = search.trim().length > 0 ? 'articles' : activeHomeView;
  const visibleArticlesBySection = helpSidebarSections
    .map((section) => ({
      ...section,
      visibleArticles: section.articleSlugs
        .map((slug) => helpArticles.find((article) => article.slug === slug) ?? null)
        .filter((article): article is HelpArticle => article !== null)
        .filter((article) => filteredArticleSlugs.has(article.slug)),
    }))
    .filter((section) => section.visibleArticles.length > 0);
  const helpCoverage = {
    articles: helpArticles.length,
    published: helpArticles.filter((article) => article.status === 'published').length,
    aiReady: helpArticles.filter((article) => article.aiEnabled).length,
    viewed: viewedArticles.size,
  };
  const homeViewTabs: Array<{
    id: HelpHomeView;
    label: string;
    count: string;
    hint: string;
  }> = [
    { id: 'overview', label: 'Inicio', count: `${helpCoverage.articles}`, hint: 'Entrada guiada' },
    { id: 'articles', label: 'Guías', count: `${filteredArticles.length}`, hint: 'Biblioteca navegable' },
    { id: 'paths', label: 'Rutas', count: `${helpLearningPaths.length}`, hint: 'Aprendizaje por rol' },
    { id: 'faq', label: 'FAQ', count: `${helpFaqItems.length}`, hint: 'Respuestas rápidas' },
    { id: 'resources', label: 'Recursos', count: `${helpResources.length}`, hint: 'Descargas y activos' },
    { id: 'recent', label: 'Recientes', count: `${latestArticles.length}`, hint: 'Últimas actualizaciones' },
  ];
  const quickCards = [
    { id: 'manual', title: 'Manual de usuario', description: 'Operación guiada por módulos y perfiles.', action: () => openArticle('que-es-sigi') },
    { id: 'technical', title: 'Manual técnico', description: 'Docker, release gate, métricas y soporte.', action: () => openArticle('manual-tecnico-operacion') },
    { id: 'guides', title: 'Guías paso a paso', description: 'Carga, EGI, proyectos y documentos.', action: () => openArticle('cargar-excel') },
    { id: 'faq', title: 'Preguntas frecuentes', description: 'Respuestas rápidas para operación diaria.', action: () => goHome() },
    { id: 'resources', title: 'Recursos descargables', description: 'Checklist, glosario y reglas IA.', action: () => goHome() },
    { id: 'knowledge', title: 'Base de conocimiento IA', description: 'Contenido indexable y versionado.', action: handleDownloadKnowledge },
  ];
  const metricCollections: Record<
    HelpMetricListId,
    {
      label: string;
      value: string;
      hint: string;
      icon: 'overview' | 'database' | 'flow' | 'status';
      tone: 'good' | 'neutral' | 'warn';
      empty: string;
      items: Array<{ id: string; title: string; subtitle: string; actionLabel: string; onClick: () => void }>;
    }
  > = {
    published: {
      label: 'Artículos publicados',
      value: String(helpCoverage.published),
      hint: 'Cobertura viva del centro de ayuda.',
      icon: 'overview',
      tone: 'good',
      empty: 'Todavía no hay artículos publicados.',
      items: publishedArticles.map((article) => ({
        id: article.slug,
        title: article.title,
        subtitle: `${moduleLabels[article.module]} · ${article.updatedAt}`,
        actionLabel: 'Abrir artículo',
        onClick: () => openArticle(article.slug),
      })),
    },
    'ai-ready': {
      label: 'Contenido IA listo',
      value: String(helpCoverage.aiReady),
      hint: 'Artículos con metadatos preparados para indexación.',
      icon: 'database',
      tone: 'neutral',
      empty: 'No hay artículos marcados como IA listos.',
      items: aiReadyArticles.map((article) => ({
        id: article.slug,
        title: article.title,
        subtitle: `${contentTypeLabels[article.contentType]} · ${article.keywords.slice(0, 3).join(', ')}`,
        actionLabel: 'Ver contenido',
        onClick: () => openArticle(article.slug),
      })),
    },
    paths: {
      label: 'Rutas de aprendizaje',
      value: String(helpLearningPaths.length),
      hint: 'Itinerarios sugeridos por perfil de usuario.',
      icon: 'flow',
      tone: 'neutral',
      empty: 'No hay rutas de aprendizaje registradas.',
      items: helpLearningPaths.map((path) => ({
        id: path.id,
        title: path.title,
        subtitle: `${path.articleSlugs.length} guía(s) · ${path.audience.map((item) => audienceLabels[item]).join(', ')}`,
        actionLabel: 'Abrir ruta',
        onClick: () => {
          const firstArticle = path.articleSlugs[0];
          if (firstArticle) {
            openArticle(firstArticle);
          }
        },
      })),
    },
    progress: {
      label: 'Progreso local',
      value: `${Math.round((viewedArticles.size / Math.max(helpArticles.length, 1)) * 100)}%`,
      hint: 'Lecturas vistas en este navegador.',
      icon: 'status',
      tone: viewedArticles.size > 0 ? 'good' : 'warn',
      empty: 'Todavía no hay lecturas vistas en este navegador.',
      items: viewedArticleList.map((article) => ({
        id: article.slug,
        title: article.title,
        subtitle: `Visto · ${article.estimatedMinutes} min · ${moduleLabels[article.module]}`,
        actionLabel: 'Retomar lectura',
        onClick: () => openArticle(article.slug),
      })),
    },
  };
  const activeMetricCollection = openMetricList ? metricCollections[openMetricList] : null;

  return (
    <section>
      <div style={helpTopShellStyle}>
        <div style={helpTopHeaderStyle}>
          <div style={compactSearchWrapStyle}>
            <input
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Buscar guía, error, módulo o integración"
              style={compactSearchInputStyle}
            />
          </div>
        </div>

        <div style={compactTopNavStyle}>
          {homeViewTabs.map((tab) => {
            const active = searchDrivenView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchHomeView(tab.id)}
                style={compactNavChipStyle(active)}
              >
                <span>{tab.label}</span>
                <span style={compactNavCountStyle(active)}>{tab.count}</span>
              </button>
            );
          })}

          {(Object.entries(metricCollections) as Array<[HelpMetricListId, (typeof metricCollections)[HelpMetricListId]]>).map(
            ([metricId, metric]) => {
              const active = openMetricList === metricId;
              return (
                <button
                  key={metricId}
                  type="button"
                  onClick={() => setOpenMetricList((current) => (current === metricId ? null : metricId))}
                  style={compactMetricChipStyle(active)}
                >
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </button>
              );
            },
          )}
        </div>
      </div>

      {notice ? <MessageBlock>{notice}</MessageBlock> : null}

      {activeMetricCollection ? (
        <Panel
          title={activeMetricCollection.label}
          subtitle="Lista desplegable con enlaces directos al contenido representado en la métrica."
          icon={activeMetricCollection.icon}
          tone={activeMetricCollection.tone}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {activeMetricCollection.items.length === 0 ? (
              <MessageBlock>{activeMetricCollection.empty}</MessageBlock>
            ) : (
              activeMetricCollection.items.map((item) => (
                <div key={item.id} style={metricListItemStyle}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ color: '#10233f', fontSize: 15 }}>{item.title}</strong>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>{item.subtitle}</span>
                  </div>
                  <button type="button" onClick={item.onClick} style={secondaryButtonStyle}>
                    {item.actionLabel}
                  </button>
                </div>
              ))
            )}
          </div>
        </Panel>
      ) : null}

      <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          {!selectedArticle ? (
            <>
              <Panel
                title={searchDrivenView === 'overview' ? 'Inicio del centro' : homeViewTitle(searchDrivenView)}
                subtitle={homeViewSubtitle(searchDrivenView)}
                icon={homeViewIcon(searchDrivenView)}
                tone={searchDrivenView === 'faq' ? 'warn' : searchDrivenView === 'resources' ? 'good' : 'neutral'}
                action={<StatPill tone="good">{filteredArticles.length} resultados visibles</StatPill>}
              >
                <div style={{ display: 'grid', gap: 16 }}>
                  {searchDrivenView === 'overview' ? (
                    <div style={{ display: 'grid', gap: 18 }}>
                      <div style={quickGridStyle}>
                        {quickCards.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            onClick={card.action}
                            style={quickAccessCardStyle}
                          >
                            <strong style={{ color: '#10233f', fontSize: 16 }}>{card.title}</strong>
                            <span style={{ color: '#5f6b7a', fontSize: 13, lineHeight: 1.5 }}>
                              {card.description}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div style={overviewColumnsStyle}>
                        <div style={stackColumnStyle}>
                          <strong style={sectionHeadlineStyle}>Empieza por aquí</strong>
                          {publishedArticles.slice(0, 4).map((article) => (
                            <button key={article.slug} type="button" onClick={() => openArticle(article.slug)} style={articleLibraryCardStyle}>
                              <div style={{ display: 'grid', gap: 6 }}>
                                <strong>{article.title}</strong>
                                <span style={itemMetaStyle}>
                                  {moduleLabels[article.module]} · {contentTypeLabels[article.contentType]}
                                </span>
                              </div>
                              <span style={itemActionStyle}>Abrir</span>
                            </button>
                          ))}
                        </div>

                        <div style={stackColumnStyle}>
                          <strong style={sectionHeadlineStyle}>Rutas sugeridas</strong>
                          {helpLearningPaths.slice(0, 4).map((path) => {
                            const completed = path.articleSlugs.filter((slug) => viewedArticles.has(slug)).length;
                            const progress = Math.round((completed / Math.max(path.articleSlugs.length, 1)) * 100);
                            const firstArticle = path.articleSlugs[0];
                            return (
                              <button
                                key={path.id}
                                type="button"
                                onClick={() => {
                                  if (firstArticle) {
                                    openArticle(firstArticle);
                                  }
                                }}
                                style={articleLibraryCardStyle}
                              >
                                <div style={{ display: 'grid', gap: 6 }}>
                                  <strong>{path.title}</strong>
                                  <span style={itemMetaStyle}>
                                    {path.articleSlugs.length} guía(s) · {path.audience.map((item) => audienceLabels[item]).join(', ')}
                                  </span>
                                </div>
                                <span style={itemActionStyle}>{progress}%</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {searchDrivenView === 'articles' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {filteredArticles.length === 0 ? (
                        <MessageBlock>No se encontraron guías con los filtros activos.</MessageBlock>
                      ) : (
                        filteredArticles.map((article) => (
                          <button
                            key={article.slug}
                            type="button"
                            onClick={() => openArticle(article.slug)}
                            style={articleLibraryCardStyle}
                          >
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <Tag>{sectionLabelForArticle(article.slug)}</Tag>
                                <Tag>{moduleLabels[article.module]}</Tag>
                                <Tag>{contentTypeLabels[article.contentType]}</Tag>
                                <Tag>{`${article.estimatedMinutes} min`}</Tag>
                              </div>
                              <strong style={{ fontSize: 17 }}>{article.title}</strong>
                              <span style={{ color: '#5f6b7a', fontSize: 14, lineHeight: 1.55 }}>{article.summary}</span>
                              <span style={itemMetaStyle}>
                                Audiencia: {article.audience.map((item) => audienceLabels[item]).join(', ')}
                              </span>
                            </div>
                            <span style={itemActionStyle}>Abrir guía</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}

                  {searchDrivenView === 'paths' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {helpLearningPaths.map((path) => {
                        const completed = path.articleSlugs.filter((slug) => viewedArticles.has(slug)).length;
                        const progress = Math.round((completed / Math.max(path.articleSlugs.length, 1)) * 100);
                        return (
                          <article key={path.id} style={listPanelCardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                              <strong>{path.title}</strong>
                              <StatPill tone={progress > 0 ? 'good' : 'neutral'}>{progress}%</StatPill>
                            </div>
                            <span style={{ color: '#5f6b7a', fontSize: 13 }}>{path.summary}</span>
                            <div style={{ display: 'grid', gap: 8 }}>
                              {path.articleSlugs.map((slug, index) => {
                                const article = helpArticles.find((item) => item.slug === slug);
                                if (!article) {
                                  return null;
                                }
                                return (
                                  <button key={slug} type="button" onClick={() => openArticle(slug)} style={pathStepStyle}>
                                    <span style={pathStepIndexStyle}>{index + 1}</span>
                                    <span style={{ display: 'grid', gap: 4, textAlign: 'left' }}>
                                      <strong>{article.title}</strong>
                                      <span style={itemMetaStyle}>{article.summary}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}

                  {searchDrivenView === 'faq' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {helpFaqItems.map((item) => {
                        const relatedSlug = item.articleSlug;
                        return (
                          <article key={item.id} style={listPanelCardStyle}>
                            <strong>{item.question}</strong>
                            <span style={{ color: '#5f6b7a', fontSize: 13, lineHeight: 1.5 }}>{item.answer}</span>
                            {relatedSlug ? (
                              <button type="button" onClick={() => openArticle(relatedSlug)} style={secondaryButtonStyle}>
                                Ver guía relacionada
                              </button>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : null}

                  {searchDrivenView === 'resources' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {helpResources.map((resource) => (
                        <a
                          key={resource.id}
                          href={resource.href}
                          target={resource.kind === 'external' ? '_blank' : undefined}
                          rel={resource.kind === 'external' ? 'noreferrer' : undefined}
                          style={resourceCardStyle}
                        >
                          <strong>{resource.title}</strong>
                          <span style={{ color: '#5f6b7a', fontSize: 13 }}>{resource.summary}</span>
                        </a>
                      ))}
                      <button type="button" onClick={handleDownloadKnowledge} style={primaryButtonStyle}>
                        Descargar manifiesto IA
                      </button>
                    </div>
                  ) : null}

                  {searchDrivenView === 'recent' ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {latestArticles.map((article) => (
                        <button
                          key={article.slug}
                          type="button"
                          onClick={() => openArticle(article.slug)}
                          style={articleLibraryCardStyle}
                        >
                          <div style={{ display: 'grid', gap: 6 }}>
                            <strong>{article.title}</strong>
                            <span style={itemMetaStyle}>
                              {article.updatedAt} · {moduleLabels[article.module]} · {contentTypeLabels[article.contentType]}
                            </span>
                          </div>
                          <span style={itemActionStyle}>Abrir</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Panel>
            </>
          ) : (
            <ArticleView
              article={selectedArticle}
              useful={usefulArticles.has(selectedArticle.slug)}
              onToggleUseful={() => markUseful(selectedArticle.slug)}
              onCopyLink={() => void handleCopyLink(selectedArticle.slug)}
              onOpenArticle={openArticle}
              onGoHome={goHome}
              sectionTitle={selectedSection?.title ?? 'Centro de ayuda'}
              previousArticle={previousArticle}
              nextArticle={nextArticle}
            />
          )}
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <Panel
            title="Mapa de ayuda"
            subtitle="Explora por sección, perfil o búsqueda."
            icon="flow"
            tone="neutral"
          >
            <div style={{ display: 'grid', gap: 16 }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={sidebarLabelStyle}>Buscar en todo el centro</span>
                <input
                  value={search}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="Busca por módulo, error o palabra clave"
                  style={sidebarSearchInputStyle}
                />
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAudienceFilter('all')}
                  style={filterChipStyle(audienceFilter === 'all')}
                >
                  Todas las audiencias
                </button>
                {Object.entries(audienceLabels).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAudienceFilter(key as HelpAudience)}
                    style={filterChipStyle(audienceFilter === key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button type="button" onClick={goHome} style={secondaryButtonStyle}>
                Ir al inicio del centro
              </button>

              <div style={{ display: 'grid', gap: 10 }}>
                {visibleArticlesBySection.map((section) => {
                  const isOpen = openSections.has(section.id);
                  const isActiveSection = selectedArticle
                    ? section.visibleArticles.some((article) => article.slug === selectedArticle.slug)
                    : false;
                  return (
                    <article
                      key={section.id}
                      style={sidebarSectionCardStyle(isActiveSection)}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(section.id)}
                        style={sidebarSectionHeaderStyle}
                      >
                        <span style={sidebarSectionLeadStyle}>
                          <span style={sidebarChevronStyle(isOpen)} aria-hidden="true">
                            ▸
                          </span>
                          <span style={sidebarSectionTitleStyle}>{section.title}</span>
                        </span>
                        <span style={sidebarSectionMetaWrapStyle}>
                          <span style={sidebarSectionCountStyle(isActiveSection)}>
                            {section.visibleArticles.length}
                          </span>
                          <span style={sidebarSectionActionStyle(isOpen)}>
                            {isOpen ? 'Ocultar' : 'Ver'}
                          </span>
                        </span>
                      </button>
                      {isOpen ? (
                        <div style={{ display: 'grid', gap: 8, padding: '0 12px 12px' }}>
                          {section.visibleArticles.map((article) => (
                            <button
                              key={article.slug}
                              type="button"
                              onClick={() => openArticle(article.slug)}
                              style={articleLinkStyle(selectedArticle?.slug === article.slug)}
                            >
                              <strong>{article.title}</strong>
                              <span>{article.summary}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel
            title={selectedArticle ? 'Navegación del artículo' : 'Panel de orientación'}
            subtitle={selectedArticle ? 'Salta a secciones internas o artículos relacionados.' : 'Accesos rápidos por uso frecuente.'}
            icon="globe"
            tone="neutral"
          >
            {selectedArticle ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <button type="button" onClick={goHome} style={secondaryButtonStyle}>
                  Volver al centro
                </button>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedArticle.sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: '#f5f7fb',
                        color: '#10233f',
                        textDecoration: 'none',
                        fontSize: 13,
                      }}
                    >
                      {section.title}
                    </a>
                  ))}
                </div>
                <DetailList
                  items={[
                    { label: 'Módulo', value: moduleLabels[selectedArticle.module] },
                    { label: 'Tipo', value: contentTypeLabels[selectedArticle.contentType] },
                    { label: 'Versión', value: selectedArticle.version },
                    { label: 'Lectura', value: `${selectedArticle.estimatedMinutes} min` },
                  ]}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <button type="button" onClick={() => switchHomeView('articles')} style={secondaryButtonStyle}>
                  Ver biblioteca completa
                </button>
                <button type="button" onClick={() => switchHomeView('paths')} style={secondaryButtonStyle}>
                  Explorar rutas
                </button>
                <button type="button" onClick={() => openArticle('seleccionar-egi')} style={secondaryButtonStyle}>
                  Selección de EGI
                </button>
                <button type="button" onClick={() => openArticle('cargar-excel')} style={secondaryButtonStyle}>
                  Carga de Excel
                </button>
                <button type="button" onClick={() => openArticle('crear-proyecto')} style={secondaryButtonStyle}>
                  Gestión de proyectos
                </button>
                <button type="button" onClick={() => openArticle('geojson-shapefile')} style={secondaryButtonStyle}>
                  Geoespacial
                </button>
                <button type="button" onClick={() => openArticle('diagnostico-tecnico')} style={secondaryButtonStyle}>
                  Soporte técnico
                </button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function ArticleView(props: {
  article: HelpArticle;
  useful: boolean;
  onToggleUseful: () => void;
  onCopyLink: () => void;
  onOpenArticle: (slug: string) => void;
  onGoHome: () => void;
  sectionTitle: string;
  previousArticle: HelpArticle | null;
  nextArticle: HelpArticle | null;
}) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={articleBreadcrumbBarStyle}>
        <button type="button" onClick={props.onGoHome} style={secondaryButtonStyle}>
          Volver al centro
        </button>
        <div style={{ color: '#5f6b7a', fontSize: 13 }}>
          {props.sectionTitle} / <strong style={{ color: '#10233f' }}>{props.article.title}</strong>
        </div>
      </div>

      <section style={articleHeaderCompactStyle}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Tag>{moduleLabels[props.article.module]}</Tag>
                <Tag>{contentTypeLabels[props.article.contentType]}</Tag>
                <Tag>{`${props.article.estimatedMinutes} min`}</Tag>
                <Tag>{`v${props.article.version}`}</Tag>
              </div>
              <h3 style={{ margin: 0, color: '#10233f', fontSize: 28, lineHeight: 1.1 }}>{props.article.title}</h3>
              <p style={{ margin: 0, color: '#5f6b7a', fontSize: 14, lineHeight: 1.55 }}>{props.article.summary}</p>
            </div>
            <StatPill tone="good">{props.useful ? 'Guardada como útil' : 'Guía activa'}</StatPill>
          </div>

          <div style={compactMetaRowStyle}>
            <span><strong>Audiencia:</strong> {props.article.audience.map((item) => audienceLabels[item]).join(', ')}</span>
            <span><strong>Autor:</strong> {props.article.author}</span>
            <span><strong>Actualizada:</strong> {props.article.updatedAt}</span>
          </div>

          <div style={articleActionRowStyle}>
            <button type="button" onClick={props.onToggleUseful} style={primaryButtonStyle}>
              {props.useful ? 'Marcada como útil' : 'Marcar como útil'}
            </button>
            <button type="button" onClick={props.onCopyLink} style={secondaryButtonStyle}>
              Copiar enlace
            </button>
            <a
              href={`mailto:soporte@sigi.local?subject=${encodeURIComponent(`Reporte sobre guía: ${props.article.title}`)}`}
              style={{
                ...secondaryButtonStyle,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Reportar problema
            </a>
            {props.previousArticle ? (
              <button type="button" onClick={() => props.onOpenArticle(props.previousArticle!.slug)} style={secondaryButtonStyle}>
                Anterior
              </button>
            ) : null}
            {props.nextArticle ? (
              <button type="button" onClick={() => props.onOpenArticle(props.nextArticle!.slug)} style={secondaryButtonStyle}>
                Siguiente
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16 }}>
        <Panel title="Resumen operativo" subtitle={props.article.content} icon="flow" tone="neutral">
          <div style={{ display: 'grid', gap: 18 }}>
            {props.article.sections.map((section) => (
              <section key={section.id} id={section.id} style={{ display: 'grid', gap: 10, scrollMarginTop: 24 }}>
                <h4 style={{ margin: 0, color: '#10233f', fontSize: 18 }}>{section.title}</h4>
                {section.body.map((paragraph) => (
                  <p key={paragraph} style={{ margin: 0, color: '#5f6b7a', lineHeight: 1.7, fontSize: 14 }}>
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#5f6b7a', lineHeight: 1.7, fontSize: 14 }}>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {section.steps ? (
                  <ol style={{ margin: 0, paddingLeft: 18, color: '#10233f', lineHeight: 1.8, fontSize: 14 }}>
                    {section.steps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : null}
              </section>
            ))}
          </div>
        </Panel>

        <Panel title="Preparación y errores" subtitle="Lo que conviene revisar antes de ejecutar la tarea." icon="alert" tone="warn">
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Requisitos previos</strong>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#5f6b7a', lineHeight: 1.7, fontSize: 14 }}>
                {props.article.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Errores comunes</strong>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#5f6b7a', lineHeight: 1.7, fontSize: 14 }}>
                {props.article.commonErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Solución de problemas</strong>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#5f6b7a', lineHeight: 1.7, fontSize: 14 }}>
                {props.article.troubleshooting.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel title="Recursos relacionados" subtitle="Descargas y activos útiles para esta guía." icon="database" tone="good">
          <div style={{ display: 'grid', gap: 10 }}>
            {props.article.resourceIds.length === 0 ? (
              <MessageBlock>No hay recursos descargables específicos para esta guía.</MessageBlock>
            ) : (
              props.article.resourceIds.map((resourceId) => {
                const resource = helpResources.find((item) => item.id === resourceId);
                if (!resource) {
                  return null;
                }
                return (
                  <a
                    key={resource.id}
                    href={resource.href}
                    style={{
                      border: '1px solid #d7dde5',
                      borderRadius: 14,
                      padding: 12,
                      color: '#10233f',
                      textDecoration: 'none',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <strong>{resource.title}</strong>
                    <span style={{ color: '#5f6b7a', fontSize: 13 }}>{resource.summary}</span>
                  </a>
                );
              })
            )}
          </div>
        </Panel>

        <Panel title="Artículos y preguntas relacionadas" subtitle="Continúa desde aquí según tu tarea." icon="globe" tone="neutral">
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {props.article.relatedArticles.map((slug) => {
                const article = helpArticles.find((item) => item.slug === slug);
                if (!article) {
                  return null;
                }
                return (
                  <button
                    key={article.slug}
                    type="button"
                    onClick={() => props.onOpenArticle(article.slug)}
                    style={articleLinkStyle(false)}
                  >
                    <strong>{article.title}</strong>
                    <span>{article.summary}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {props.article.relatedQuestions.map((question) => (
                <span
                  key={question}
                  style={{
                    background: '#f5f7fb',
                    borderRadius: 12,
                    padding: '10px 12px',
                    color: '#5f6b7a',
                    fontSize: 13,
                  }}
                >
                  {question}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Tag(props: { children: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '6px 10px',
        background: '#f5f7fb',
        color: '#10233f',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {props.children}
    </span>
  );
}

function filterChipStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#0b4f3a' : '#d7dde5'}`,
    borderRadius: 999,
    padding: '7px 11px',
    background: active ? '#e8f5ef' : '#ffffff',
    color: active ? '#0b4f3a' : '#10233f',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.2,
    cursor: 'pointer',
  } as const;
}

function sectionLabelForArticle(slug: string) {
  return helpSidebarSections.find((section) => section.articleSlugs.includes(slug))?.title ?? 'General';
}

function homeViewTitle(view: HelpHomeView) {
  return {
    overview: 'Inicio del centro',
    articles: 'Biblioteca de guías',
    paths: 'Rutas de aprendizaje',
    faq: 'Preguntas frecuentes',
    resources: 'Recursos destacados',
    recent: 'Últimos contenidos actualizados',
  }[view];
}

function homeViewSubtitle(view: HelpHomeView) {
  return {
    overview: 'Una vista de entrada pensada para aprendizaje, consulta operativa y preparación de conocimiento.',
    articles: 'Explora las guías como un catálogo claro, con filtros, metadatos y entrada directa.',
    paths: 'Recorridos sugeridos por rol, con pasos visibles y progreso local.',
    faq: 'Respuestas rápidas para desbloquear tareas sin perder tiempo navegando.',
    resources: 'Descargas, glosario, reglas IA y activos de apoyo para soporte y capacitación.',
    recent: 'Lo más reciente para operación, soporte y actualización funcional.',
  }[view];
}

function homeViewIcon(view: HelpHomeView) {
  const iconMap = {
    overview: 'overview',
    articles: 'globe',
    paths: 'flow',
    faq: 'alert',
    resources: 'database',
    recent: 'audit',
  } as const satisfies Record<HelpHomeView, 'overview' | 'globe' | 'flow' | 'alert' | 'database' | 'audit'>;
  return iconMap[view];
}

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 12,
  padding: '11px 14px',
  background: '#0b4f3a',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
} as const;

const secondaryButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '10px 14px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

function articleLinkStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#0b4f3a' : '#d7dde5'}`,
    borderRadius: 12,
    padding: '10px 11px',
    background: active ? '#eef7f3' : '#ffffff',
    color: '#10233f',
    display: 'grid',
    gap: 5,
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: active ? '0 10px 22px rgba(11, 79, 58, 0.08)' : 'none',
  } as const;
}

function metricExplorerCardStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#0b4f3a' : '#d7dde5'}`,
    borderRadius: 20,
    padding: 18,
    background: active
      ? 'linear-gradient(180deg, #ffffff 0%, #eef7f3 100%)'
      : 'linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%)',
    boxShadow: active
      ? '0 18px 38px rgba(11, 79, 58, 0.12)'
      : '0 16px 34px rgba(16, 35, 63, 0.06)',
    position: 'relative',
    overflow: 'hidden',
    display: 'grid',
    gap: 12,
    textAlign: 'left',
    cursor: 'pointer',
  } as const;
}

function metricTopLineStyle(tone: 'good' | 'neutral' | 'warn') {
  return {
    position: 'absolute',
    inset: '0 auto auto 0',
    width: '100%',
    height: 3,
    background: tone === 'good' ? '#1f8a5b' : tone === 'warn' ? '#b45309' : '#cbd5e1',
    opacity: 0.95,
  } as const;
}

const metricCardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'start',
} as const;

const metricLabelStyle = {
  color: '#5f6b7a',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
} as const;

const metricValueStyle = {
  color: '#10233f',
  fontSize: 32,
  fontWeight: 800,
  lineHeight: 1,
} as const;

const metricHintStyle = {
  color: '#5f6b7a',
  fontSize: 13,
  lineHeight: 1.45,
} as const;

const metricListItemStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'center',
  background: '#ffffff',
} as const;

const helpTopShellStyle = {
  display: 'grid',
  gap: 12,
  marginBottom: 16,
} as const;

const helpTopHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'center',
  flexWrap: 'wrap',
} as const;

const compactSearchWrapStyle = {
  minWidth: 'min(420px, 100%)',
  flex: '1 1 320px',
  maxWidth: 520,
} as const;

const compactSearchInputStyle = {
  width: '100%',
  border: '1px solid #d7dde5',
  borderRadius: 14,
  padding: '11px 14px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 14,
} as const;

const compactTopNavStyle = {
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
  paddingBottom: 2,
} as const;

function compactNavChipStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#0b4f3a' : '#d7dde5'}`,
    borderRadius: 999,
    padding: '9px 12px',
    background: active ? '#eef7f3' : '#ffffff',
    color: active ? '#0b4f3a' : '#10233f',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as const;
}

function compactNavCountStyle(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    padding: '0 8px',
    background: active ? '#0b4f3a' : '#f5f7fb',
    color: active ? '#ffffff' : '#10233f',
    fontSize: 11,
    fontWeight: 800,
  } as const;
}

function compactMetricChipStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#0b4f3a' : '#d7dde5'}`,
    borderRadius: 999,
    padding: '9px 12px',
    background: active ? '#f0faf5' : '#fbfcfe',
    color: '#10233f',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as const;
}

const homeTabsWrapStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  marginBottom: 18,
} as const;

function homeTabButtonStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#0b4f3a' : '#d7dde5'}`,
    borderRadius: 18,
    padding: 14,
    background: active ? '#eef7f3' : '#ffffff',
    display: 'grid',
    gap: 8,
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: active ? '0 14px 30px rgba(11, 79, 58, 0.08)' : '0 10px 22px rgba(16, 35, 63, 0.04)',
  } as const;
}

const homeTabTopStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'center',
} as const;

function homeTabCountStyle(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 28,
    borderRadius: 999,
    padding: '0 10px',
    background: active ? '#0b4f3a' : '#f5f7fb',
    color: active ? '#ffffff' : '#10233f',
    fontSize: 12,
    fontWeight: 800,
  } as const;
}

const helpHeroCardStyle = {
  padding: 18,
  borderRadius: 18,
  background: 'linear-gradient(135deg, #eef7f3 0%, #f8fbfd 100%)',
  border: '1px solid #d7dde5',
  display: 'grid',
  gap: 12,
} as const;

const quickGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
} as const;

const quickAccessCardStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 18,
  padding: 16,
  background: '#ffffff',
  display: 'grid',
  gap: 8,
  textAlign: 'left',
  cursor: 'pointer',
} as const;

const overviewColumnsStyle = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
} as const;

const stackColumnStyle = {
  display: 'grid',
  gap: 10,
} as const;

const sectionHeadlineStyle = {
  color: '#10233f',
  fontSize: 16,
} as const;

const articleLibraryCardStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 18,
  padding: 16,
  background: '#ffffff',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'center',
  textAlign: 'left',
  cursor: 'pointer',
} as const;

const itemMetaStyle = {
  color: '#5f6b7a',
  fontSize: 12,
  lineHeight: 1.5,
} as const;

const itemActionStyle = {
  color: '#0b4f3a',
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: 'nowrap',
} as const;

const listPanelCardStyle = {
  border: '1px solid #e6edf2',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 10,
  background: '#ffffff',
} as const;

const pathStepStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 14,
  padding: 12,
  display: 'flex',
  gap: 12,
  alignItems: 'start',
  background: '#f9fbfd',
  cursor: 'pointer',
  textAlign: 'left',
} as const;

const pathStepIndexStyle = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: '#e8f5ef',
  color: '#0b4f3a',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 800,
  flex: '0 0 auto',
} as const;

const resourceCardStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  textDecoration: 'none',
  color: '#10233f',
  display: 'grid',
  gap: 6,
  background: '#ffffff',
} as const;

const articleBreadcrumbBarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
} as const;

const articlePagerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
} as const;

const articleHeaderCompactStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 18,
  padding: 18,
  background: '#ffffff',
  boxShadow: '0 12px 26px rgba(16, 35, 63, 0.05)',
} as const;

const compactMetaRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  color: '#5f6b7a',
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const articleActionRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
} as const;

const sidebarLabelStyle = {
  fontSize: 12,
  color: '#5f6b7a',
  fontWeight: 700,
  letterSpacing: '0.01em',
} as const;

const sidebarSearchInputStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '10px 12px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 13,
  lineHeight: 1.35,
} as const;

function sidebarSectionCardStyle(active: boolean) {
  return {
    border: `1px solid ${active ? '#9fd3ba' : '#d7dde5'}`,
    borderRadius: 16,
    background: active ? '#f6fcf8' : '#fbfcfe',
    overflow: 'hidden',
    boxShadow: active ? '0 8px 20px rgba(11, 79, 58, 0.06)' : 'none',
  } as const;
}

const sidebarSectionHeaderStyle = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  padding: '13px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  gap: 12,
} as const;

const sidebarSectionLeadStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
} as const;

function sidebarChevronStyle(open: boolean) {
  return {
    color: open ? '#0b4f3a' : '#5f6b7a',
    fontSize: 12,
    fontWeight: 800,
    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 160ms ease',
    display: 'inline-flex',
    width: 12,
    justifyContent: 'center',
    flex: '0 0 auto',
  } as const;
}

const sidebarSectionTitleStyle = {
  color: '#10233f',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.25,
  textAlign: 'left',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const sidebarSectionMetaWrapStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  flex: '0 0 auto',
} as const;

function sidebarSectionCountStyle(active: boolean) {
  return {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    padding: '0 7px',
    background: active ? '#0b4f3a' : '#edf1f6',
    color: active ? '#ffffff' : '#46566d',
    fontSize: 11,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
}

function sidebarSectionActionStyle(open: boolean) {
  return {
    color: open ? '#0b4f3a' : '#5f6b7a',
    background: open ? '#eef7f3' : '#f5f7fb',
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  } as const;
}
