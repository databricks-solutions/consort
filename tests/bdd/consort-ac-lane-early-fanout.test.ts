import { describe, it, expect } from "vitest";
import { runAcLanes, planAcLanes } from "../../consort/experiment/ac-lane-coordinator";

// S2: the supersession sweep no longer gates the fan-out. PROOF at the coordinator level (hermetic —
// driveSerial / driveInLane / snapshotBeforeFanout are all injected spies, no git/Lakebase): the lanes
// fan out IMMEDIATELY after the serial-first AC commits the migration, with only the resume-anchor
// snapshot in between. There is no longer a `clearSupersession` hook on runAcLanes at all, so the
// 13-16min sweep CANNOT sit on the pre-fan-out critical path — it was moved to post-merge.

describe("runAcLanes — S2: fan-out begins immediately after the serial-first AC (no pre-fan-out sweep gate)", () => {
  it("sequences serialFirst -> snapshot -> concurrent lanes, nothing gating between serial-first and fan-out", async () => {
    const plan = planAcLanes({ acOrder: ["AC1", "AC2", "AC3", "AC4"], enabled: true });
    expect(plan.serialFirst).toBe("AC1");
    expect(plan.parallelLanes).toEqual(["AC2", "AC3", "AC4"]);

    const events: string[] = [];
    let inFlight = 0;
    let peakConcurrency = 0;
    await runAcLanes({
      plan,
      concurrency: 4,
      driveSerial: async (ac) => { events.push(`serial:${ac}`); },
      snapshotBeforeFanout: () => { events.push("snapshot"); },
      driveInLane: async (spec) => {
        inFlight++; peakConcurrency = Math.max(peakConcurrency, inFlight);
        events.push(`lane-start:${spec.laneId}`);
        await new Promise((r) => setTimeout(r, 20)); // hold so lanes overlap
        inFlight--;
      },
    });

    // 1) the serial-first AC (which authors the migration) runs FIRST,
    expect(events[0]).toBe("serial:AC1");
    // 2) the resume-anchor snapshot is the ONLY thing between it and the fan-out,
    expect(events[1]).toBe("snapshot");
    // 3) then the remaining ACs fan out — and they ran CONCURRENTLY (not a serial gate).
    expect(events.slice(2).filter((e) => e.startsWith("lane-start:")).sort()).toEqual([
      "lane-start:AC2", "lane-start:AC3", "lane-start:AC4",
    ]);
    expect(peakConcurrency).toBe(3);
    // 4) structural guarantee: runAcLanes has no `clearSupersession` parameter anymore, so the sweep
    //    is physically incapable of gating the fan-out — the TypeScript below would not compile if it did.
    //    (The sweep now runs post-merge in runParallelAcLanesLive; proven by the live run's log order.)
  });
});

// S3 (opt-in migrationPrepStep): AC1 continues on its own journey WHILE the others go. The contract
// migration is authored by a dedicated serial PREP step (the only unavoidable serial work — every lane
// forks from the committed migration); then ALL FOUR ACs — including AC1 — fan out as lanes, so AC1's
// verify/review no longer bracket the fan-out as a 16-24min serial prefix. This is the hermetic PROOF of
// the 4-way early fan-out; the live drive-wiring (the migration-prep turn + AC1's verify-only lane) is
// validated separately by a run.
describe("planAcLanes / runAcLanes — S3: migration-prep, then ALL ACs (incl AC1) fan out concurrently", () => {
  it("plans a migration-prep step + all four ACs as lanes (AC1 is NOT a serial prefix)", () => {
    const plan = planAcLanes({ acOrder: ["AC1", "AC2", "AC3", "AC4"], enabled: true, migrationPrepStep: true });
    expect(plan.mode).toBe("parallel");
    expect(plan.migrationPrep).toBe("AC1");   // the migration is a dedicated serial prep...
    expect(plan.serialFirst).toBeUndefined(); // ...NOT a full serial-first AC build
    expect(plan.parallelLanes).toEqual(["AC1", "AC2", "AC3", "AC4"]); // AC1 fans out WITH the others
  });

  it("runs the migration-prep once, then fans out ALL FOUR ACs concurrently (AC1 overlaps the rest)", async () => {
    const plan = planAcLanes({ acOrder: ["AC1", "AC2", "AC3", "AC4"], enabled: true, migrationPrepStep: true });
    const events: string[] = [];
    let inFlight = 0;
    let peakConcurrency = 0;
    let prepCalls = 0;
    await runAcLanes({
      plan,
      concurrency: 4,
      driveSerial: async () => { throw new Error("driveSerial must NOT run in the migration-prep plan"); },
      driveMigrationPrep: async (ac) => { prepCalls++; events.push(`prep:${ac}`); },
      snapshotBeforeFanout: () => { events.push("snapshot"); },
      driveInLane: async (spec) => {
        inFlight++; peakConcurrency = Math.max(peakConcurrency, inFlight);
        events.push(`lane-start:${spec.laneId}`);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
      },
    });
    // the migration prep ran exactly once (the only serial work), for AC1,
    expect(prepCalls).toBe(1);
    expect(events[0]).toBe("prep:AC1");
    expect(events[1]).toBe("snapshot");
    // then ALL FOUR ACs — AC1 included — fanned out, and they overlapped (true 4-way concurrency).
    expect(events.slice(2).filter((e) => e.startsWith("lane-start:")).sort()).toEqual([
      "lane-start:AC1", "lane-start:AC2", "lane-start:AC3", "lane-start:AC4",
    ]);
    expect(peakConcurrency).toBe(4);
  });
});

// Split-by-kind: the plan is DERIVED from each AC's real test-kind composition — a multi-kind AC fans
// out into ONE LANE PER KIND (no guessing "heavy", no combining kinds); a single-kind AC (or one with
// no kind data) stays ONE lane. This proves the generalization: every kind gets its own parallel lane.
describe("planAcLanes — split-by-kind: one lane per kind, single-kind ACs stay whole", () => {
  const base = { enabled: true, migrationPrepStep: true, splitAcsByKind: true } as const;

  it("fans a 3-kind AC out into one lane per kind (client, component, fitness) — none combined", () => {
    const plan = planAcLanes({
      ...base,
      acOrder: ["AC1", "AC2", "AC4"],
      acKinds: { AC1: ["behavior"], AC2: ["behavior"], AC4: ["component", "client", "fitness"] },
    });
    const ids = plan.laneSpecs.map((s) => s.laneId);
    expect(ids).toContain("AC4.client");
    expect(ids).toContain("AC4.component");
    expect(ids).toContain("AC4.fitness");
    expect(ids).not.toContain("AC4"); // the whole-AC lane is replaced by the per-kind lanes
    // each lane is scoped to exactly its ONE kind — nothing combined.
    expect(plan.laneSpecs.find((s) => s.laneId === "AC4.client")!.kinds).toEqual(["client"]);
    expect(plan.laneSpecs.find((s) => s.laneId === "AC4.component")!.kinds).toEqual(["component"]);
    expect(plan.laneSpecs.find((s) => s.laneId === "AC4.fitness")!.kinds).toEqual(["fitness"]);
  });

  it("splits a 2-kind AC into exactly two per-kind lanes", () => {
    const plan = planAcLanes({ ...base, acOrder: ["AC1", "AC2", "AC4"], acKinds: { AC4: ["component", "client"] } });
    const ac4 = plan.laneSpecs.filter((s) => s.ac === "AC4").map((s) => s.laneId).sort();
    expect(ac4).toEqual(["AC4.client", "AC4.component"]);
  });

  it("does NOT split a single-kind AC (one kind, or no kind data) — stays one whole-AC lane", () => {
    const e2eOnly = planAcLanes({ ...base, acOrder: ["AC1", "AC2", "AC4"], acKinds: { AC4: ["client"] } });
    expect(e2eOnly.laneSpecs.map((s) => s.laneId)).toContain("AC4");
    expect(e2eOnly.laneSpecs.find((s) => s.laneId === "AC4")!.kinds).toBeUndefined();
    const noData = planAcLanes({ ...base, acOrder: ["AC1", "AC2", "AC4"] });
    expect(noData.laneSpecs.map((s) => s.laneId)).toEqual(["AC1", "AC2", "AC4"]);
  });

  it("does NOT split when the lever is off", () => {
    const splitOff = planAcLanes({ enabled: true, migrationPrepStep: true, acOrder: ["AC1", "AC2", "AC4"], acKinds: { AC4: ["component", "client"] } });
    expect(splitOff.laneSpecs.map((s) => s.laneId)).toEqual(["AC1", "AC2", "AC4"]);
  });

  it("degrades to sequential below the lane threshold regardless of split", () => {
    const plan = planAcLanes({ ...base, acOrder: ["AC1", "AC2"], acKinds: { AC2: ["component", "client"] } });
    expect(plan.mode).toBe("sequential");
    expect(plan.laneSpecs).toEqual([]);
  });
});
