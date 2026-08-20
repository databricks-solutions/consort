#!/usr/bin/env node
/** Overridable inputs, so tests isolate the config to a temp dir. */
interface HomeConfigDeps {
    env?: NodeJS.ProcessEnv;
    /** Home dir override (defaults to os.homedir()); used only when $XDG_CONFIG_HOME is unset. */
    homedir?: string;
}

interface TelemetryCliDeps extends HomeConfigDeps {
    out?: (s: string) => void;
    err?: (s: string) => void;
    isTTY?: boolean;
}
/** The status snapshot (also the --json shape). */
interface TelemetryStatus {
    telemetry_enabled: boolean;
    install_id: string;
    will_emit_now: boolean;
    is_tty: boolean;
    in_ci: boolean;
    do_not_track: boolean;
    killed: boolean;
    endpoint_armed: boolean;
    config_file: string;
    schema: string;
    level: number;
}
/** Run the CLI. Returns the process exit code. Never throws. */
declare function runTelemetryCli(argv: string[], deps?: TelemetryCliDeps): number;

export { type TelemetryCliDeps, type TelemetryStatus, runTelemetryCli };
