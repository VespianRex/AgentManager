/**
 * Minimal compatibility TUI entrypoint.
 *
 * The full JSX-based TUI lives in `.opencode/tui/agent-manager.jsx`, but a
 * small source-level wrapper is kept for tests and older imports that expect a
 * `tui` export from `src/tui.ts`.
 */
export declare function tui(api: any): Promise<void>;
declare const _default: {
    id: string;
    tui: typeof tui;
};
export default _default;
//# sourceMappingURL=tui.d.ts.map