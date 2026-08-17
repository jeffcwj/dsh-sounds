/** dsh-sounds client bundle: plugin entry { name, inject, apply }. */
/** Event kinds playable through window.__dshSounds.play(kind). */
export declare type SoundEventKind = 'done' | 'error' | 'subagentDone' | 'question' | 'permission';
/** Embedded opencode-pack sound names (45 files). */
export declare type SoundName =
  | `alert-${string}` | `bip-bop-${string}` | `nope-${string}`
  | `staplebops-${string}` | `yup-${string}`;
/** Browser console hook installed as window.__dshSounds. */
export interface DshSoundsHook {
    prefs(): Record<string, unknown>;
    /** Per-event enable switches (localStorage-persisted). */
    events(): Record<SoundEventKind, boolean>;
    /** System-notification switches, incl. the master `enabled` key. */
    notifications(): Record<SoundEventKind | 'enabled', boolean>;
    play(kind: SoundEventKind): void;
    playName(name: SoundName): void;
    preview(name: SoundName): void;
    setPrefs(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
    setEvent(kind: SoundEventKind, enabled: boolean): void;
    setNotification(key: SoundEventKind | 'enabled', enabled: boolean): void;
}
export declare const name = "dsh-sounds";
export declare const inject: string[];
export declare function apply(ctx: unknown): void;
