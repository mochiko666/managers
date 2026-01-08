import { readFileSync, type PathLike } from "fs";
import fs from "node:fs/promises";
import { isFSError } from "../typeguards/typeguards.js";
import { PromiseQueue } from "./queue.js";

export abstract class BaseCacheManager<Cache> {
  public get cache() {
    return this.__cache as Cache extends Array<infer Holds>
      ? ReadonlyArray<Holds>
      : Cache extends Map<infer K, infer V>
      ? ReadonlyMap<K, V>
      : Readonly<Cache>;
  }
  public constructor(protected __cache: Cache) {}
}

export abstract class APICacheManager<Cache, API> extends BaseCacheManager<Cache> {
  public constructor(protected readonly api: API, init: Cache) {
    super(init);
  }
}

export abstract class FileCacheManager<Cache> extends BaseCacheManager<Cache> {
  public constructor(public readonly path: PathLike, init: Cache) {
    super(init);
  }
}

export abstract class JsonCacheManager<Cache> extends FileCacheManager<Cache> {
  protected readonly queue: PromiseQueue = new PromiseQueue();
  public async load(): Promise<
    Cache extends Array<infer Holds>
      ? ReadonlyArray<Holds>
      : Cache extends Map<infer K, infer V>
      ? ReadonlyMap<K, V>
      : Readonly<Cache>
  > {
    return this.queue.set(async () => {
      try {
        const raw = await fs.readFile(this.path, "utf-8");
        return (this.__cache = JSON.parse(raw));
      } catch (e: unknown) {
        if (isFSError(e) && e.code === "ENOENT") return this.cache;
        throw e;
      }
    });
  }
  public loadSync(): Cache extends Array<infer Holds>
    ? ReadonlyArray<Holds>
    : Cache extends Map<infer K, infer V>
    ? ReadonlyMap<K, V>
    : Readonly<Cache> {
    try {
      const raw = readFileSync(this.path, "utf-8");
      return (this.__cache = JSON.parse(raw));
    } catch (e: unknown) {
      if (isFSError(e) && e.code === "ENOENT") return this.cache;
      throw e;
    }
  }
  public async save(): Promise<void> {
    return this.queue.set(async () => {
      const tmpPath = this.path + ".tmp";
      await fs.writeFile(tmpPath, JSON.stringify(this.cache, null, 2));
      await fs.rename(tmpPath, this.path);
    });
  }
}

export class ListFileManager<Cache> extends JsonCacheManager<Cache[]> {
  /**
   * Creates an instance of ListManager by loading from file asynchronously.
   * @param path The file path to store the list.
   */
  public static async init<Cache>(path: PathLike): Promise<ListFileManager<Cache>> {
    const instance = new ListFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of ListManager by loading from file synchronously.
   * @param path The file path to store the list.
   */
  public static initSync<Cache>(path: PathLike): ListFileManager<Cache> {
    const instance = new ListFileManager<Cache>(path); // ["123456789", "987654321"]
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of ListManager. \
   * Use `ListManager.init()` or `ListManager.initSync()` to initialize by loading from file.
   * @param path The file path to store the list.
   * @param init The initial array list.
   */
  public constructor(path: PathLike, init: Cache[] = []) {
    super(path, init);
  }

  public has(item: Cache): boolean {
    return this.cache.includes(item);
  }
  public get(index: number): Cache | undefined {
    return this.cache.at(index);
  }
  public async add(item: Cache, unique: boolean = true): Promise<void> {
    if ((unique && !this.has(item)) || !unique) this.__cache.push(item);
    return this.save();
  }
  public async delete(text: string): Promise<void> {
    this.__cache = this.__cache.filter((cachedId) => cachedId !== text);
    return this.save();
  }
  public distinct(): Cache[] {
    return Array.from(new Set(this.cache));
  }
}

export class RecordFileManager<Cache> extends JsonCacheManager<Record<string, Cache>> {
  /**
   * Creates an instance of RecordManager by loading from file asynchronously.
   * @param path The file path to store the record.
   */
  public static async init<Cache>(path: PathLike): Promise<RecordFileManager<Cache>> {
    const instance = new RecordFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of RecordManager by loading from file synchronously.
   * @param path The file path to store the record.
   */
  public static initSync<Cache>(path: PathLike): RecordFileManager<Cache> {
    const instance = new RecordFileManager<Cache>(path);
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of RecordManager. Use `RecordManager.init()` or `RecordManager.initSync()`
   * to initialize by loading from file.
   * @param path The file path to store the record.
   * @param init The initial record object.
   */
  public constructor(path: PathLike, init: Record<string, Cache> = {}) {
    super(path, init);
  }

  public has(key: string): boolean {
    return this.cache.hasOwnProperty(key);
  }
  public get(key: string): Cache | undefined {
    return this.cache[key];
  }
  public async set(key: string, value: Cache): Promise<void> {
    this.__cache[key] = value;
    return this.save();
  }
  public async add(key: string, value: Cache): Promise<void> {
    if (!this.has(key)) return this.set(key, value);
  }
  public async delete(key: string): Promise<void> {
    delete this.__cache[key];
    return this.save();
  }
}

export class MapFileManager<Cache> extends JsonCacheManager<Map<string, Cache>> {
  public static async init<Cache>(path: PathLike): Promise<MapFileManager<Cache>> {
    const instance = new MapFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  public static initSync<Cache>(path: PathLike): MapFileManager<Cache> {
    const instance = new MapFileManager<Cache>(path);
    instance.loadSync();
    return instance;
  }
  public constructor(path: PathLike, init: Map<string, Cache> = new Map()) {
    super(path, init);
  }

  public load = async (): Promise<ReadonlyMap<string, Cache>> =>
    this.queue.set(async () => {
      try {
        const raw = await fs.readFile(this.path, "utf-8");
        const obj: Record<string, Cache> = JSON.parse(raw);
        return (this.__cache = new Map(Object.entries(obj)));
      } catch (e: unknown) {
        if (isFSError(e) && e.code === "ENOENT") return this.cache;
        throw e;
      }
    });
  public loadSync(): ReadonlyMap<string, Cache> {
    try {
      const raw = readFileSync(this.path, "utf-8");
      const obj: Record<string, Cache> = JSON.parse(raw);
      return (this.__cache = new Map(Object.entries(obj)));
    } catch (e: unknown) {
      if (isFSError(e) && e.code === "ENOENT") return this.cache;
      throw e;
    }
  }
  public save = async (): Promise<void> =>
    this.queue.set(async () => {
      const tmpPath = this.path + ".tmp";
      const obj = Object.fromEntries(this.cache);
      await fs.writeFile(tmpPath, JSON.stringify(obj, null, 2));
      await fs.rename(tmpPath, this.path);
    });
  public has(key: string): boolean {
    return this.cache.has(key);
  }
  public get(key: string): Cache | undefined {
    return this.cache.get(key);
  }
  public async set(key: string, value: Cache): Promise<void> {
    this.__cache.set(key, value);
    return this.save();
  }
  public async add(key: string, value: Cache): Promise<void> {
    if (!this.has(key)) this.set(key, value);
  }
  public async delete(key: string): Promise<void> {
    this.__cache.delete(key);
    return this.save();
  }
}
