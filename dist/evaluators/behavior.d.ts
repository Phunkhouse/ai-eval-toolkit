import type { Behavior, EvaluationContext, Evaluator, Severity } from '../types.ts';
export interface BehaviorEvaluatorOptions {
    /**
     * What the system did: answered, abstained (declined for lack of information) or refused
     * (declined on policy grounds). Called for every case with an `expected.behavior`, including
     * output that failed to parse, which you may classify as you see fit (often `answer`).
     */
    classify: (ctx: EvaluationContext) => Behavior;
    id?: string;
    severity?: {
        /** Answered where it should have abstained or refused: usually the dangerous direction. Default critical. */
        answeredInstead?: Severity;
        /** Any other mismatch, such as abstaining on an answerable case. Default major. */
        other?: Severity;
    };
}
/** Compares what the system did with `expected.behavior`, and measures abstention precision and recall. */
export declare function behaviorEvaluator(options: BehaviorEvaluatorOptions): Evaluator;
