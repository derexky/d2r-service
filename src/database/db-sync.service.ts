import {
  CallHandler,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { from, switchMap } from 'rxjs';
import { Storage } from '@google-cloud/storage';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';

// 正本 d2r.sqlite 在 GCS 上的那個物件；generation 是 GCS 每次覆寫都會換的版本號
export interface DbObject {
  generation(): Promise<string>;
  download(generation: string, dest: string): Promise<void>;
  // 只在 GCS 上仍是 ifGenerationMatch 那一版時才寫入（否則丟 412），回傳新的 generation
  upload(data: Buffer, ifGenerationMatch: string): Promise<string>;
}

export function gcsObject(uri: string): DbObject {
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`DB_GCS_URI 要是 gs://bucket/path，收到 ${uri}`);
  const bucket = new Storage().bucket(m[1]);
  const name = m[2];
  return {
    async generation() {
      const [meta] = await bucket.file(name).getMetadata();
      return String(meta.generation);
    },
    async download(generation, dest) {
      await bucket
        .file(name, { generation: Number(generation) })
        .download({ destination: dest });
    },
    async upload(data, ifGenerationMatch) {
      const file = bucket.file(name);
      await file.save(data, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: Number(ifGenerationMatch) },
        metadata: { contentType: 'application/x-sqlite3' },
      });
      // save() 會把上傳回應的 metadata 存回 file，這就是自己這次上傳的版本，不用再查一次（中間可能又被別人改）
      return String(file.metadata.generation);
    },
  };
}

const CHECK_INTERVAL_MS = 60_000;
// 舊連線晚一點才關，讓已經拿到它 prepared statement 的查詢跑完
const CLOSE_DELAY_MS = 30_000;

// TypeORM 的 better-sqlite3 driver 只有一個連線和一個共用 query runner，runner 快取的 statement 綁在連線上，
// 所以兩個都要換。回傳舊連線，由呼叫端決定何時關
export function swapConnection(
  dataSource: DataSource,
  path: string,
): Database.Database {
  const driver = dataSource.driver as unknown as {
    databaseConnection: Database.Database;
    queryRunner?: unknown;
  };
  const old = driver.databaseConnection;
  const conn = new Database(path);
  conn.pragma('foreign_keys = ON');
  driver.databaseConnection = conn;
  driver.queryRunner = undefined;
  return old;
}

const isPreconditionFailed = (err: unknown) =>
  (err as { code?: number }).code === 412;

// 只有 GCS 上那一份 d2r.sqlite 是正本。每個程序在本機放一份已知 generation 的副本：
// 讀取時最多每分鐘檢查一次有沒有新版；admin 寫入（需 DB_GCS_WRITE=true）會在同一個請求內上傳回 GCS，
// 並用 ifGenerationMatch 確保不會蓋掉別人在這期間上傳的版本
@Injectable()
export class DbSyncService {
  private readonly log = new Logger(DbSyncService.name);
  private readonly dir = join(tmpdir(), 'd2r-db');
  private generation = '';
  private path = '';
  private checkedAt = 0;
  private dataSource?: DataSource;
  // 檢查／換檔／寫入一次只做一件，換檔才不會插進寫入中間
  private lock: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly object: DbObject | null,
    private readonly writable: boolean,
  ) {}

  // TypeORM 要開的本機路徑：GCS 最新版；沒設 DB_GCS_URI 時沿用本機檔案
  async init(localPath: () => string): Promise<string> {
    if (!this.object) return localPath();
    mkdirSync(this.dir, { recursive: true });
    this.generation = await this.object.generation();
    this.path = await this.fetch(this.generation);
    this.checkedAt = Date.now();
    this.log.log(`Loaded d2r.sqlite generation ${this.generation}`);
    return this.path;
  }

  attach(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  // 每個請求都會呼叫；距上次檢查超過一分鐘才真的去問 GCS
  async refreshIfStale() {
    if (!this.object || Date.now() - this.checkedAt < CHECK_INTERVAL_MS) return;
    // 先記時間再等，避免同時進來的請求都去檢查
    this.checkedAt = Date.now();
    await this.locked(() => this.syncToLatest()).catch((err: Error) =>
      this.log.warn(`DB refresh failed: ${err.message}`),
    );
  }

  // 在最新版上執行 admin 的寫入並上傳。上傳失敗（別人先上傳了，或連不到 GCS）時本機副本換回 GCS 的版本，
  // 這次寫入等於沒發生，呼叫端會收到錯誤
  async write<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.object) return fn();
    if (!this.writable) {
      throw new ForbiddenException(
        '這個環境的 DB 是唯讀的（未設 DB_GCS_WRITE）',
      );
    }
    return this.locked(async () => {
      await this.syncToLatest();
      const result = await fn();
      try {
        this.generation = await this.object!.upload(
          this.connection().serialize(),
          this.generation,
        );
        this.log.log(`Published d2r.sqlite generation ${this.generation}`);
      } catch (err) {
        await this.syncToLatest(true).catch((e: Error) =>
          this.log.error(`Reverting the local DB failed: ${e.message}`),
        );
        if (isPreconditionFailed(err)) {
          throw new ConflictException(
            'DB 已被其他地方更新，這次修改沒有存入，請重新整理後再改',
          );
        }
        throw new ServiceUnavailableException(
          `上傳 DB 失敗，這次修改沒有存入：${(err as Error).message}`,
        );
      }
      return result;
    });
  }

  private async syncToLatest(force = false) {
    const generation = await this.object!.generation();
    this.checkedAt = Date.now();
    if (generation === this.generation && !force) return;
    const path = await this.fetch(generation);
    const old = swapConnection(this.dataSource!, path);
    const oldPath = this.path;
    setTimeout(() => {
      old.close();
      rmSync(oldPath, { force: true });
    }, CLOSE_DELAY_MS).unref();
    this.path = path;
    this.generation = generation;
    this.log.log(`Switched to d2r.sqlite generation ${generation}`);
  }

  // 每次都下載到新檔名：撤回時同一個 generation 的舊檔可能已經被這次失敗的寫入改過
  private async fetch(generation: string) {
    const path = join(this.dir, `d2r-${generation}-${Date.now()}.sqlite`);
    await this.object!.download(generation, path);
    return path;
  }

  private connection() {
    return (
      this.dataSource!.driver as unknown as {
        databaseConnection: Database.Database;
      }
    ).databaseConnection;
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }
}

// 每個請求先確認本機副本不舊於一分鐘
@Injectable()
export class DbSyncInterceptor implements NestInterceptor {
  constructor(private readonly sync: DbSyncService) {}

  intercept(_: unknown, next: CallHandler) {
    return from(this.sync.refreshIfStale()).pipe(
      switchMap(() => next.handle()),
    );
  }
}
