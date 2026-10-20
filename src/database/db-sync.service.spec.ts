import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { DataSource, Entity, PrimaryColumn, Column } from 'typeorm';
import { DbObject, DbSyncService } from './db-sync.service';

@Entity('notes')
class Note {
  @PrimaryColumn() id: number;
  @Column() text: string;
}

function makeDb(text: string): Buffer {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL)');
  db.prepare('INSERT INTO notes VALUES (1, ?)').run(text);
  const buf = db.serialize();
  db.close();
  return buf;
}

// 模擬 GCS：每次覆寫換一個 generation，ifGenerationMatch 不符就丟 412
class FakeObject implements DbObject {
  versions = new Map<string, Buffer>();
  current = '';
  private next = 1;
  failUpload = false;

  put(data: Buffer) {
    this.current = String(this.next++);
    this.versions.set(this.current, data);
    return this.current;
  }
  generation() {
    return Promise.resolve(this.current);
  }
  download(generation: string, dest: string) {
    writeFileSync(dest, this.versions.get(generation)!);
    return Promise.resolve();
  }
  upload(data: Buffer, ifGenerationMatch: string) {
    if (this.failUpload) return Promise.reject(new Error('network down'));
    if (ifGenerationMatch !== this.current)
      return Promise.reject(Object.assign(new Error('412'), { code: 412 }));
    return Promise.resolve(this.put(data));
  }
  text(generation = this.current) {
    const db = new Database(this.versions.get(generation));
    const { text } = db
      .prepare('SELECT text FROM notes WHERE id = 1')
      .get() as {
      text: string;
    };
    db.close();
    return text;
  }
}

describe('DbSyncService', () => {
  let gcs: FakeObject;
  let ds: DataSource;

  async function start(writable: boolean) {
    const sync = new DbSyncService(gcs, writable);
    ds = await new DataSource({
      type: 'better-sqlite3',
      database: await sync.init(() => 'unused'),
      entities: [Note],
    }).initialize();
    sync.attach(ds);
    return sync;
  }
  const read = async () =>
    (await ds.getRepository(Note).findOneByOrFail({ id: 1 })).text;
  const setText = (text: string) =>
    ds.query('UPDATE notes SET text = ? WHERE id = 1', [text]);

  beforeEach(() => {
    gcs = new FakeObject();
    gcs.put(makeDb('v1'));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (ds?.isInitialized) await ds.destroy();
  });

  it('falls back to the local path without GCS', async () => {
    const sync = new DbSyncService(null, false);
    await expect(sync.init(() => '/local.sqlite')).resolves.toBe(
      '/local.sqlite',
    );
  });

  it('loads the latest generation and uploads writes', async () => {
    const sync = await start(true);
    expect(await read()).toBe('v1');

    await sync.write(() => setText('v2'));

    expect(gcs.current).toBe('2');
    expect(gcs.text()).toBe('v2');
    expect(await read()).toBe('v2');
  });

  it('picks up another writer’s upload once the check interval passes', async () => {
    const sync = await start(false);
    gcs.put(makeDb('from elsewhere'));

    await sync.refreshIfStale();
    expect(await read()).toBe('v1');

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    await sync.refreshIfStale();
    expect(await read()).toBe('from elsewhere');
  });

  it('writes on top of the latest generation', async () => {
    const sync = await start(true);
    gcs.put(makeDb('newer'));

    await sync.write(async () => {
      expect(await read()).toBe('newer');
      await setText('edited');
    });
    expect(gcs.text()).toBe('edited');
  });

  it('rejects a write that lost the race and reverts the local copy', async () => {
    const sync = await start(true);
    jest.spyOn(gcs, 'upload').mockImplementationOnce((data, gen) => {
      gcs.put(makeDb('racer'));
      return FakeObject.prototype.upload.call(
        gcs,
        data,
        gen,
      ) as Promise<string>;
    });

    await expect(sync.write(() => setText('mine'))).rejects.toMatchObject({
      status: 409,
    });
    expect(gcs.text()).toBe('racer');
    expect(await read()).toBe('racer');
  });

  it('reverts the local copy when the upload fails', async () => {
    const sync = await start(true);
    gcs.failUpload = true;

    await expect(sync.write(() => setText('lost'))).rejects.toMatchObject({
      status: 503,
    });
    expect(await read()).toBe('v1');
  });

  it('refuses writes where DB_GCS_WRITE is off', async () => {
    const sync = await start(false);
    await expect(sync.write(() => setText('x'))).rejects.toMatchObject({
      status: 403,
    });
    expect(gcs.current).toBe('1');
  });
});
