import type { Baseline } from './memory/recall.js';

interface Plan { baseline: Baseline; entities: string[] }
type EvidenceState = 'usable' | 'empty' | 'failed';
export class ResearchCoverage {
  private plan?: Plan;
  private evidence = new Map<string, { current?: EvidenceState; dated?: EvidenceState }>();
  constructor(private baselines: Baseline[]) {}
  accept(input: { baselineId: number; entities?: string[]; entity: string; since?: string; until?: string }): string | undefined {
    const baseline = this.baselines.find(b => b.id === input.baselineId);
    if (!baseline) return 'Choose a baselineId from supplied saved answers.';
    const entities = [...new Set((input.entities ?? this.plan?.entities ?? []).map(s => s.trim()).filter(Boolean))];
    const text = (baseline.question + '\n' + baseline.answer).toLocaleLowerCase();
    if (!entities.length || entities.length > 6 || entities.some(e => !text.includes(e.toLocaleLowerCase()))) return 'List up to six entity names exactly as written in the saved baseline.';
    if (!entities.includes(input.entity)) return 'The searched entity must belong to the declared baseline entities.';
    if (input.until || (input.since && input.since !== baseline.since)) return `Use since=${baseline.since} for dated changes, or omit both date filters for the current official page.`;
    if (this.plan && (this.plan.baseline.id !== baseline.id || JSON.stringify([...this.plan.entities].sort()) !== JSON.stringify([...entities].sort()))) return 'Keep the same baseline and complete entity list throughout this comparison.';
    this.plan ??= { baseline, entities };
  }
  record(entity: string, dated: boolean, state: EvidenceState) {
    const row = this.evidence.get(entity) ?? {};
    const kind = dated ? 'dated' : 'current';
    // A later failed duplicate cannot erase usable evidence.
    if (row[kind] !== 'usable') row[kind] = state;
    this.evidence.set(entity,row);
  }
  get complete() {
    return !!this.plan && this.plan.entities.every(e => { const r = this.evidence.get(e); return !!r?.current && !!r?.dated; });
  }
  summary() {
    return this.plan ? { baselineId: this.plan.baseline.id, answeredAt: this.plan.baseline.answeredAt,
      since: this.plan.baseline.since, baselineQuote: this.plan.baseline.answer,
      entities: this.plan.entities.map(entity => { const row = this.evidence.get(entity); return {
        entity, current: row?.current ?? 'missing', dated: row?.dated ?? 'missing',
        canCompareCurrentClaim: row?.current === 'usable',
      }; }),
    } : { status: 'No baseline research plan declared.' };
  }
}
