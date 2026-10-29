/** dsh-sounds host plugin: JSON-backed preferences + fenced /sounds/api routes. */
import type { Context } from '@deepseek-ai/cordis';
/** User-facing preferences (persisted in <DSH_HOME>/storages/plugin-data/dsh-sounds.json). */
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
export declare function apply(ctx: Context): void;
