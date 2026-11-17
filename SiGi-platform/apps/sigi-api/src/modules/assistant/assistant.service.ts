import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AdminService } from '../admin/admin.service';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { SearchService } from '../search/search.service';

type AskInput = {
  question: string;
  scope: 'active' | 'global';
  requestedEgiId: string | null;
  principal: AuthPrincipal;
};

type SearchItem = Awaited<ReturnType<SearchService['search']>>['items'][number];

const STOP_WORDS = new Set([
  'cual', 'cuál', 'cuales', 'cuáles', 'como', 'cómo', 'donde', 'dónde', 'cuando', 'cuándo',
  'para', 'desde', 'hasta', 'sobre', 'entre', 'esta', 'este', 'estos', 'estas', 'existe', 'existen',
  'tiene', 'tienen', 'mostrar', 'muestra', 'dame', 'informacion', 'información', 'sigi', 'proyecto',
  'proyectos', 'indicador', 'indicadores', 'informe', 'informes', 'documento', 'documentos',
]);

@Injectable()
export class AssistantService {
  constructor(
    private readonly adminService: AdminService,
    private readonly searchService: SearchService,
    private readonly auditService: AuditService,
  ) {}

  async ask(input: AskInput) {
    const question = input.question.trim();
    if (question.length < 4) throw new BadRequestException('La pregunta requiere al menos 4 caracteres.');
    if (question.length > 500) throw new BadRequestException('La pregunta no puede superar 500 caracteres.');

    const questionHash = createHash('sha256').update(question, 'utf8').digest('hex');
    let resolvedEgiId: string | null = null;
    try {
      resolvedEgiId = await this.adminService.resolveAdminScopeEgiId(
        input.principal.subject,
        input.requestedEgiId,
        input.scope,
      );
      const keywords = extractKeywords(question);
      const searches = await Promise.all(keywords.map((keyword) => this.searchService.search({
        query: keyword,
        scope: input.scope,
        limit: 4,
        requestedEgiId: resolvedEgiId,
        principal: input.principal,
      })));
      const evidence = deduplicate(searches.flatMap((result) => result.items)).slice(0, 10);
      const citations = evidence.map((item, index) => ({ ...item, citation: index + 1 }));
      const evidenceStatus = citations.length > 0 ? 'supported' as const : 'no_evidence' as const;
      const answer = buildEvidenceAnswer(question, citations);
      const auditId = await this.auditService.recordAccessEvent({
        actorUserId: input.principal.userId,
        egiId: input.scope === 'active' ? resolvedEgiId : null,
        action: 'assistant.question.answered',
        result: 'success',
        details: {
          questionHash,
          questionLength: question.length,
          scope: input.scope,
          evidenceStatus,
          resultCount: citations.length,
          resultTypes: Array.from(new Set(citations.map((citation) => citation.type))),
          mode: 'evidence_retrieval',
        },
      });

      return {
        question,
        answer,
        mode: 'evidence_retrieval' as const,
        evidenceStatus,
        scope: input.scope,
        citations,
        limitations: [
          'La respuesta se limita a metadatos visibles y no interpreta el contenido interno de documentos.',
          'Las coincidencias recuperadas no equivalen a un conteo exhaustivo ni sustituyen una validación técnica.',
          'Esta versión no utiliza un modelo generativo externo.',
        ],
        auditId,
        answeredAt: new Date().toISOString(),
      };
    } catch (reason) {
      await this.auditService.recordAccessEvent({
        actorUserId: input.principal.userId,
        egiId: null,
        action: 'assistant.question.failed',
        result: 'failed',
        details: {
          questionHash,
          questionLength: question.length,
          requestedScope: input.scope,
          errorType: reason instanceof Error ? reason.constructor.name : 'UnknownError',
        },
      }).catch(() => undefined);
      throw reason;
    }
  }
}

function extractKeywords(question: string) {
  const tokens = question
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9\u00c0-\u024f-]+/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens)).slice(0, 4).length > 0
    ? Array.from(new Set(tokens)).slice(0, 4)
    : [question.slice(0, 120)];
}

function deduplicate(items: SearchItem[]) {
  const unique = new Map<string, SearchItem>();
  items.forEach((item) => unique.set(`${item.type}:${item.id}`, item));
  return Array.from(unique.values());
}

function buildEvidenceAnswer(question: string, citations: Array<SearchItem & { citation: number }>) {
  if (citations.length === 0) {
    return 'No encontré evidencia visible que respalde una respuesta en el alcance actual. Prueba con el nombre o código exacto de un proyecto, indicador, informe o documento.';
  }
  const references = citations.slice(0, 5).map((item) => {
    const context = [item.code, item.subtitle, item.status].filter(Boolean).join(' · ');
    return `${item.title}${context ? ` (${context})` : ''} [${item.citation}]`;
  });
  const asksForCount = /\b(cu[aá]ntos?|cantidad|total)\b/i.test(question);
  const prefix = asksForCount
    ? `La búsqueda recuperó ${citations.length} coincidencia${citations.length === 1 ? '' : 's'} visible${citations.length === 1 ? '' : 's'}; este valor no es un total exhaustivo.`
    : 'Encontré evidencia relacionada en el SIGI.';
  return `${prefix} Fuentes principales: ${references.join('; ')}.`;
}
