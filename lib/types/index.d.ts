/** dsh-sounds host plugin: settings namespace + fenced /sounds/api routes. */
import type { Context } from '@deepseek-ai/cordis';
import type { Schema } from 'schemastery';
/** User-facing preferences (validated by the settings service). */
export interface SoundsPrefs {
    enabled: boolean;
    volume: number;
    done: string;
    error: string;
    subagentDone: string;
    question: string;
    permission: string;
}
export declare const name = "dsh-sounds";
export declare const inject: string[];
export declare const Config: Schema;
export declare const PrefsSchema: Schema<SoundsPrefs>;
export declare function apply(ctx: Context, config: unknown): void;
