// BDD coverage for the layering-clean gate (scripts/sftdd/layering-clean.ts).
// Each test builds an isolated temp project so the static source scan runs
// against a real working tree (no interpreter needed). The gate proves a
// service-backed feature's boundary/routes layer does NOT call the DB session
// directly (a fat controller) and that a repository layer exists.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkLayeringClean,
  checkImportLayering,
  checkOrmContainment,
  checkModulePlacement,
  checkInlineRendering,
  checkCodeBudget,
  checkDuplicateClasses,
  layeringConfigFromArchitecture,
} from "../../consort/architecture/layering-clean.js";

const tmpDirs: string[] = [];

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layering-clean-"));
  tmpDirs.push(dir);
  return dir;
}

function write(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** A boundary (FastAPI route module) that calls the DB session directly. */
const FAT_CONTROLLER = `
from fastapi import APIRouter, Depends
from app.db import get_session

router = APIRouter()

@router.post("/bugs")
def create_bug(payload: dict, db = Depends(get_session)):
    bug = Bug(**payload)
    db.add(bug)
    db.commit()
    return bug
`;

/** A boundary that delegates to a service (no session ops). */
const CLEAN_BOUNDARY = `
from fastapi import APIRouter, Depends
from app.services.bug_service import BugService

router = APIRouter()

@router.post("/bugs")
def create_bug(payload: dict, service: BugService = Depends()):
    return service.create(payload)
`;

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

describe("checkLayeringClean", () => {
  it("flags a service-backed boundary that calls the DB session directly (fat controller)", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", FAT_CONTROLLER);
    // even with a repository present, the session op in the boundary is a violation
    write(dir, "app/repositories/bug_repository.py", "class BugRepository:\n    pass\n");

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(false);
    if (!r.clean) {
      expect(r.violations.join("\n")).toMatch(/bugs\.py:\d+/);
      expect(r.violations.join("\n")).toMatch(/db\.add|db\.commit/);
      expect(r.remediation).toBeTruthy();
    }
  });

  it("passes a layered fixture: clean boundary + a repository module exists", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", CLEAN_BOUNDARY);
    write(dir, "app/services/bug_service.py", "class BugService:\n    pass\n");
    write(dir, "app/repositories/bug_repository.py", "class BugRepository:\n    pass\n");

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.scanned.some((s) => s.endsWith("bugs.py"))).toBe(true);
  });

  it("flags a service-backed feature with a clean boundary but NO repository module", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", CLEAN_BOUNDARY);
    write(dir, "app/services/bug_service.py", "class BugService:\n    pass\n");
    // no app/repositories/* nor app/repository.py

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(false);
    if (!r.clean) {
      expect(r.violations.join("\n")).toMatch(/no repository module/);
    }
  });

  it("exempts a feature that is not service-backed (layering not warranted)", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", FAT_CONTROLLER);

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: false });
    expect(r.clean).toBe(true);
    expect(r.scanned).toEqual([]);
  });

  it("is clean when there are no boundary modules to scan", () => {
    const dir = mkProject();
    // service-backed but no app/main.py and no app/routes
    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(true);
    expect(r.scanned).toEqual([]);
  });

  it("honors explicit boundary + repository module overrides", () => {
    const dir = mkProject();
    write(dir, "src/api/handlers.py", FAT_CONTROLLER);
    write(dir, "src/data/store.py", "class Store:\n    pass\n");

    const dirty = checkLayeringClean({
      projectDir: dir,
      serviceBacked: true,
      boundaryModules: ["src/api/handlers.py"],
      repositoryModules: ["src/data/store.py"],
    });
    expect(dirty.clean).toBe(false);

    write(dir, "src/api/clean.py", CLEAN_BOUNDARY);
    const clean = checkLayeringClean({
      projectDir: dir,
      serviceBacked: true,
      boundaryModules: ["src/api/clean.py"],
      repositoryModules: ["src/data/store.py"],
    });
    expect(clean.clean).toBe(true);
  });

  it("does not false-positive on dict.get / non-session .get calls", () => {
    const dir = mkProject();
    write(
      dir,
      "app/routes/bugs.py",
      `
from fastapi import APIRouter
router = APIRouter()

@router.get("/bugs/{id}")
def read_bug(id: int, cache: dict):
    return cache.get(id)
`,
    );
    write(dir, "app/repositories/bug_repository.py", "class BugRepository:\n    pass\n");
    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(true);
  });
});

describe("layeringConfigFromArchitecture", () => {
  it("reads service_backed + boundary/repository module paths from architecture.json layers", () => {
    const arch = JSON.stringify({
      service_backed: true,
      layers: [
        { name: "API", role: "boundary", module: "app/routes" },
        { name: "Domain", role: "service", module: "app/services" },
        { name: "Persistence", role: "repository", module: "app/repositories" },
      ],
    });
    const cfg = layeringConfigFromArchitecture(arch);
    expect(cfg.serviceBacked).toBe(true);
    expect(cfg.boundaryModules).toEqual(["app/routes"]);
    expect(cfg.repositoryModules).toEqual(["app/repositories"]);
  });

  it("returns serviceBacked=false for a non-service-backed architecture", () => {
    const cfg = layeringConfigFromArchitecture(JSON.stringify({ service_backed: false }));
    expect(cfg.serviceBacked).toBe(false);
    expect(cfg.boundaryModules).toEqual([]);
    expect(cfg.repositoryModules).toEqual([]);
  });

  it("tolerates invalid / empty JSON", () => {
    expect(layeringConfigFromArchitecture("not json")).toEqual({
      serviceBacked: false,
      boundaryModules: [],
      repositoryModules: [],
      allModules: [],
    });
  });

  it("returns allModules + boundary renders_via", () => {
    const cfg = layeringConfigFromArchitecture(
      JSON.stringify({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes/", renders_via: "jinja2" },
          { role: "service", module: "app/services/" },
          { role: "repository", module: "app/repositories/" },
        ],
      }),
    );
    expect(cfg.allModules).toHaveLength(3);
    expect(cfg.rendersVia).toBe("jinja2");
  });
});

describe("checkModulePlacement (A1): layers live at their declared module paths", () => {
  it("flags a flat file where a package directory was declared", () => {
    const dir = mkProject();
    write(dir, "app/services.py", "x = 1\n"); // built flat
    const r = checkModulePlacement(dir, [{ role: "service", module: "app/services/" }]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/service.*app\/services\/.*package directory/i);
  });

  it("passes when each declared module exists as declared (dir for `/`, file for `.py`)", () => {
    const dir = mkProject();
    write(dir, "app/services/bug_service.py", "x = 1\n");
    write(dir, "app/main.py", "x = 1\n");
    const r = checkModulePlacement(dir, [
      { role: "service", module: "app/services/" },
      { role: "boundary", module: "app/main.py" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("flags a declared module that does not exist at all", () => {
    const dir = mkProject();
    const r = checkModulePlacement(dir, [{ role: "repository", module: "app/repositories/" }]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/not found/i);
  });

  it("flags a STALE flat module shadowing a correctly-built package (the F5 orphan)", () => {
    // The package exists as declared AND a leftover flat app/models.py sits
    // alongside it (an orphan from a flat->package migration that was never
    // deleted). The package is correct; the flat shadow is the violation.
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe: ...\n");
    write(dir, "app/models.py", "class Recipe: ...\n"); // stale orphan
    const r = checkModulePlacement(dir, [{ role: "models", module: "app/models/" }]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/stale flat app\/models\.py.*alongside|orphan.*flat->package/i);
  });

  it("passes a declared package with NO flat shadow alongside it", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe: ...\n");
    const r = checkModulePlacement(dir, [{ role: "models", module: "app/models/" }]);
    expect(r.ok).toBe(true);
  });
});

describe("checkDuplicateClasses (A4): no class is defined in two modules", () => {
  it("flags the same top-level class defined in two modules (the F5 Recipe orphan)", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe(Base):\n    __tablename__ = 'recipes'\n");
    write(dir, "app/models.py", "class Recipe(Base):\n    __tablename__ = 'recipes'\n"); // stale orphan
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/class Recipe is defined in 2 modules/);
    expect(r.violations.join(" ")).toMatch(/app\/models\.py/);
    expect(r.violations.join(" ")).toMatch(/app\/models\/recipe\.py/);
    expect(r.remediation).toBeTruthy();
  });

  it("catches the duplicate even when NO architecture/layers are declared (declaration-independent)", () => {
    // This is the resiliency the placement check lacks: it needs no `models` layer
    // declaration – it scans source directly, so an architect omitting the layer
    // cannot let a duplicate class slip through.
    const dir = mkProject();
    write(dir, "app/models.py", "class Recipe:\n    pass\n");
    write(dir, "app/domain/recipe.py", "class Recipe:\n    pass\n");
    // no architecture.json anywhere; the gate still fires
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/class Recipe is defined in 2 modules/);
  });

  it("passes when each class is defined in exactly one module", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe(Base):\n    pass\n");
    write(dir, "app/models/cuisine.py", "class Cuisine(Base):\n    pass\n");
    write(dir, "app/models/__init__.py", "from .recipe import Recipe\nfrom .cuisine import Cuisine\n"); // re-export, not a def
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("ignores nested Config/Meta classes (only column-0 defs count)", () => {
    const dir = mkProject();
    write(dir, "app/schemas/recipe.py", "class RecipeIn(BaseModel):\n    name: str\n    class Config:\n        orm_mode = True\n");
    write(dir, "app/schemas/cuisine.py", "class CuisineIn(BaseModel):\n    name: str\n    class Config:\n        orm_mode = True\n");
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(true); // two nested `Config` classes are NOT a duplicate
  });

  it("ignores test files and migration dirs (legit repeated names there)", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe(Base):\n    pass\n");
    write(dir, "tests/test_recipe.py", "class Recipe:\n    pass\n"); // test fixture, skipped
    write(dir, "alembic/versions/0001_init.py", "class Recipe:\n    pass\n"); // migration dir, skipped
    write(dir, "app/conftest.py", "class Recipe:\n    pass\n"); // conftest, skipped
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(true);
  });
});

describe("checkInlineRendering (A2): boundary renders via a framework, not inline HTML", () => {
  it("flags a boundary returning an inline HTML document with no templating seam", () => {
    const dir = mkProject();
    write(dir, "app/main.py", `from fastapi.responses import HTMLResponse\n\ndef page():\n    html = "<!DOCTYPE html><html><body>hi</body></html>"\n    return HTMLResponse(content=html)\n`);
    const r = checkInlineRendering(dir, ["app/main.py"], "jinja2");
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/inline HTML/i);
  });

  it("passes a boundary that uses a TemplateResponse seam", () => {
    const dir = mkProject();
    write(dir, "app/main.py", `from fastapi.templating import Jinja2Templates\ntemplates = Jinja2Templates(directory="templates")\n\ndef page(request):\n    return templates.TemplateResponse("index.html", {"request": request})\n`);
    const r = checkInlineRendering(dir, ["app/main.py"], "jinja2");
    expect(r.ok).toBe(true);
  });
});

describe("checkCodeBudget (A3): DRY + function-length budget", () => {
  it("flags an over-long function", () => {
    const dir = mkProject();
    const body = Array.from({ length: 70 }, (_, i) => `    x${i} = ${i}`).join("\n");
    write(dir, "app/services.py", `def big():\n${body}\n`);
    const r = checkCodeBudget(dir, ["app/services.py"], { maxFunctionLines: 60 });
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/def big is \d+ lines/i);
  });

  it("flags a duplicated block across two files (DRY)", () => {
    const dir = mkProject();
    const block = `    total = compute_total(items)\n    tax = total * rate\n    grand = total + tax\n    log.info(grand)\n    persist(grand)\n    notify(grand)\n`;
    write(dir, "app/a.py", `def fa():\n${block}`);
    write(dir, "app/b.py", `def fb():\n${block}`);
    const r = checkCodeBudget(dir, ["app/a.py", "app/b.py"], { dupWindow: 6 });
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/duplicated .*block/i);
  });

  it("passes clean, short, non-duplicated code", () => {
    const dir = mkProject();
    write(dir, "app/services.py", `def small(x):\n    return x + 1\n`);
    expect(checkCodeBudget(dir, ["app/services.py"]).ok).toBe(true);
  });
});

// The canonical four-layer declaration (mirrors the stockflow reference
// architecture.json): boundary -> service -> repository -> models, inward.
const CANONICAL_LAYERS = [
  { role: "boundary", module: "app/routes/", may_import: ["service"] },
  { role: "service", module: "app/services/", may_import: ["repository"] },
  { role: "repository", module: "app/repositories/", may_import: ["models"] },
  { role: "models", module: "app/models/", may_import: [] as string[] },
];

/** Lay down a clean, correctly-layered app that mirrors the reference corpus'
 *  import shape exactly (absolute imports, inward direction, and the composition
 *  root's `import app.models  # noqa: F401` registration side-effect). */
function writeCleanLayeredApp(dir: string): void {
  write(dir, "app/main.py", `from fastapi import FastAPI\nfrom app.routes.stock import router as stock_router\nimport app.models  # noqa: F401\n\napp = FastAPI()\napp.include_router(stock_router)\n`);
  write(dir, "app/routes/stock.py", `from fastapi import APIRouter, Depends\nfrom app.services.stock_service import StockService\n\nrouter = APIRouter()\n\n@router.get("/stock")\ndef list_stock(service: StockService = Depends()):\n    return service.all()\n`);
  write(dir, "app/services/stock_service.py", `from app.repositories.stock_repository import StockRepository\n\nclass StockService:\n    def all(self):\n        return StockRepository().all()\n`);
  write(dir, "app/repositories/stock_repository.py", `from app.models.stock import StockRecord\n\nclass StockRepository:\n    def all(self, db):\n        return db.query(StockRecord).all()\n`);
  write(dir, "app/models/stock.py", `from app.database import Base\n\nclass StockRecord(Base):\n    __tablename__ = "stock_records"\n`);
}

describe("checkImportLayering (A5): dependencies point inward per may_import", () => {
  it("passes the clean inward chain that mirrors the reference corpus (incl. the noqa registration import)", () => {
    const dir = mkProject();
    writeCleanLayeredApp(dir);
    const r = checkImportLayering(dir, CANONICAL_LAYERS);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
    // it really did scan the layer sources (not a vacuous pass)
    expect(r.scanned.some((s) => s.endsWith("stock.py"))).toBe(true);
  });

  it("flags the boundary reaching around the service straight into the repository", () => {
    const dir = mkProject();
    writeCleanLayeredApp(dir);
    // boundary imports the repository directly (skips the service it may_import)
    write(dir, "app/routes/stock.py", `from fastapi import APIRouter\nfrom app.repositories.stock_repository import StockRepository\n\nrouter = APIRouter()\n`);
    const r = checkImportLayering(dir, CANONICAL_LAYERS);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/routes\/stock\.py:\d+/);
    expect(r.violations.join("\n")).toMatch(/boundary may not import repository/);
    expect(r.remediation).toBeTruthy();
  });

  it("flags a backward dependency (service importing the boundary above it)", () => {
    const dir = mkProject();
    writeCleanLayeredApp(dir);
    write(dir, "app/services/stock_service.py", `from app.routes.stock import router\n\nclass StockService:\n    pass\n`);
    const r = checkImportLayering(dir, CANONICAL_LAYERS);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/service may not import boundary/);
  });

  it("resolves a relative import and flags a forbidden cross-layer dependency", () => {
    const dir = mkProject();
    writeCleanLayeredApp(dir);
    // relative import: app/routes/stock.py -> ..repositories (boundary -> repository)
    write(dir, "app/routes/stock.py", `from fastapi import APIRouter\nfrom ..repositories.stock_repository import StockRepository\n\nrouter = APIRouter()\n`);
    const r = checkImportLayering(dir, CANONICAL_LAYERS);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/boundary may not import repository/);
  });

  it("does not flag same-role siblings or non-layer imports (fastapi, utils)", () => {
    const dir = mkProject();
    write(dir, "app/routes/stock.py", `from fastapi import APIRouter\nfrom app.routes.health import ping\nfrom app.utils import fmt\n\nrouter = APIRouter()\n`);
    write(dir, "app/routes/health.py", `def ping():\n    return "ok"\n`);
    write(dir, "app/services/stock_service.py", `class StockService:\n    pass\n`);
    write(dir, "app/repositories/stock_repository.py", `class StockRepository:\n    pass\n`);
    write(dir, "app/models/stock.py", `class StockRecord:\n    pass\n`);
    write(dir, "app/utils.py", `def fmt(x):\n    return str(x)\n`);
    const r = checkImportLayering(dir, CANONICAL_LAYERS);
    expect(r.ok).toBe(true);
  });

  it("does not flag app.repository against a same-named prefix collision (app.repositories)", () => {
    // A layer prefix `app.repository` must not match the distinct `app.repositories`.
    const dir = mkProject();
    write(dir, "app/services/x.py", `from app.repositories.stock_repository import StockRepository\n`);
    const layers = [
      { role: "service", module: "app/services/", may_import: [] as string[] },
      { role: "repository", module: "app/repository.py", may_import: [] as string[] },
    ];
    // service may_import nothing; it imports app.repositories (NOT the declared
    // app/repository.py repository layer) -> no declared layer matched -> clean.
    const r = checkImportLayering(dir, layers);
    expect(r.ok).toBe(true);
  });

  it("is clean when no layers (or a single layer) are declared", () => {
    const dir = mkProject();
    write(dir, "app/routes/stock.py", `from app.repositories.x import Y\n`);
    expect(checkImportLayering(dir, []).ok).toBe(true);
    expect(checkImportLayering(dir, [{ role: "boundary", module: "app/routes/", may_import: [] }]).ok).toBe(true);
  });
});

describe("checkOrmContainment (A6): only the repository touches the ORM session", () => {
  it("passes when persistence lives only in the repository", () => {
    const dir = mkProject();
    writeCleanLayeredApp(dir);
    const r = checkOrmContainment(dir, CANONICAL_LAYERS);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("flags a service that calls the DB session directly (leaked persistence)", () => {
    const dir = mkProject();
    writeCleanLayeredApp(dir);
    write(dir, "app/services/stock_service.py", `class StockService:\n    def all(self, db):\n        return db.query("StockRecord").all()\n`);
    const r = checkOrmContainment(dir, CANONICAL_LAYERS);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/services\/stock_service\.py:\d+/);
    expect(r.violations.join("\n")).toMatch(/service layer must not touch the ORM session/);
    expect(r.remediation).toBeTruthy();
  });

  it("exempts the check entirely when no repository layer is declared", () => {
    const dir = mkProject();
    write(dir, "app/services/x.py", `def f(db):\n    return db.query("X").all()\n`);
    const r = checkOrmContainment(dir, [{ role: "service", module: "app/services/" }]);
    expect(r.ok).toBe(true);
    expect(r.scanned).toEqual([]);
  });

  it("does not flag the repository or infrastructure layers themselves", () => {
    const dir = mkProject();
    write(dir, "app/repositories/stock_repository.py", `class StockRepository:\n    def all(self, db):\n        return db.query("X").all()\n`);
    write(dir, "app/database.py", `def healthcheck(db):\n    db.execute("SELECT 1")\n`);
    const r = checkOrmContainment(dir, [
      { role: "repository", module: "app/repositories/" },
      { role: "infrastructure", module: "app/database.py" },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("layeringConfigFromArchitecture carries may_import for the layering checks", () => {
  it("threads each layer's may_import into allModules", () => {
    const cfg = layeringConfigFromArchitecture(
      JSON.stringify({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes/", may_import: ["service"] },
          { role: "service", module: "app/services/", may_import: ["repository"] },
        ],
      }),
    );
    const boundary = cfg.allModules.find((m) => m.role === "boundary");
    expect(boundary?.may_import).toEqual(["service"]);
  });
});
