import type { AskSigiAnswer } from '@sigi/domain';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageBlock } from '../components/section-kit';
import { useEgi } from '../contexts/EgiContext';
import { workspaceApi } from '../services/api';
import { canUseGlobalView } from '../utils/global-view';

const SUGGESTIONS = [
  '¿Qué información existe sobre restauración?',
  'Muéstrame evidencia relacionada con hectáreas restauradas',
  '¿Qué informes NDC están disponibles?',
];

export function AskSigiPage() {
  const { activeEgi, currentUser, globalViewScope, setGlobalViewScope } = useEgi();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<AskSigiAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowGlobalView = canUseGlobalView(currentUser);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const normalized = question.trim();
    if (normalized.length < 4 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await workspaceApi.askSigi(normalized, globalViewScope);
      setResponse(result.data);
    } catch (reason) {
      setResponse(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="sigi-assistant">
      <header className="sigi-assistant__header">
        <div>
          <span>Asistencia · Evidencia gobernada</span>
          <h1>Ask SIGI</h1>
          <p>Consulta información visible en tu EGI y recibe una respuesta con fuentes navegables.</p>
        </div>
        <span className="sigi-assistant__mode">Recuperación de evidencia · sin IA generativa externa</span>
      </header>

      <div className="sigi-assistant__scope" aria-label="Alcance de Ask SIGI">
        <strong>Alcance</strong>
        <button type="button" className={globalViewScope === 'active' ? 'is-active' : ''} onClick={() => setGlobalViewScope('active')}>
          EGI activo
        </button>
        {allowGlobalView ? (
          <button type="button" className={globalViewScope === 'global' ? 'is-active' : ''} onClick={() => setGlobalViewScope('global')}>
            Vista global
          </button>
        ) : null}
        <span>{globalViewScope === 'active' ? activeEgi?.name ?? 'Sin EGI seleccionado' : 'Todos los EGI autorizados'}</span>
      </div>

      <form className="sigi-assistant__composer" onSubmit={(event) => void submit(event)}>
        <label htmlFor="ask-sigi-question">Pregunta</label>
        <textarea
          id="ask-sigi-question"
          value={question}
          maxLength={500}
          rows={4}
          placeholder="Ejemplo: ¿Qué información existe sobre restauración?"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <div className="sigi-assistant__composer-footer">
          <span>{question.length}/500 · No incluyas datos personales o secretos.</span>
          <button type="submit" disabled={question.trim().length < 4 || isLoading}>
            {isLoading ? 'Consultando…' : 'Consultar SIGI'}
          </button>
        </div>
      </form>

      <div className="sigi-assistant__suggestions" aria-label="Preguntas sugeridas">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>
        ))}
      </div>

      {error ? <MessageBlock tone="danger">No fue posible responder la consulta. {error}</MessageBlock> : null}

      {response ? (
        <article className="sigi-assistant__answer" aria-label="Respuesta de Ask SIGI">
          <div className="sigi-assistant__answer-heading">
            <div>
              <span>Respuesta basada en evidencia</span>
              <h2>{response.evidenceStatus === 'supported' ? 'Información encontrada' : 'Sin evidencia suficiente'}</h2>
            </div>
            <span>{response.scope === 'global' ? 'Vista global' : 'EGI activo'}</span>
          </div>
          <p className="sigi-assistant__answer-text">{response.answer}</p>

          {response.citations.length > 0 ? (
            <section className="sigi-assistant__citations" aria-label="Fuentes citadas">
              <h3>Fuentes</h3>
              <ol>
                {response.citations.map((citation) => (
                  <li key={`${citation.type}-${citation.id}`}>
                    <Link to={citation.path}>
                      <strong>{citation.title}</strong>
                      <span>{[citation.code, citation.subtitle, citation.status].filter(Boolean).join(' · ')}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <details className="sigi-assistant__limitations">
            <summary>Límites de esta respuesta</summary>
            <ul>{response.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            <p>Consulta auditada: <code>{response.auditId}</code></p>
          </details>
        </article>
      ) : null}
    </section>
  );
}
