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

export abstract class IOCacheManager<Cache> extends FileCacheManager<Cache> {
  protected readonly queue: PromiseQueue = new PromiseQueue();
  public abstract load(): Promise<Cache>;
  public abstract loadSync(): Cache;
}

export class ListFileManager extends IOCacheManager<string[]> {
  /**
   * Creates an instance of ListManager by loading from file asynchronously.
   * @param path The file path to store the list.
   */
  public static async init(path: PathLike): Promise<ListFileManager> {
    const instance = new ListFileManager(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of ListManager by loading from file synchronously.
   * @param path The file path to store the list.
   */
  public static initSync(path: PathLike): ListFileManager {
    const raw = readFileSync(path, "utf-8"); // 123456789\n987654321
    return new ListFileManager(path, raw.split("\n")); // ["123456789", "987654321"]
  }
  /**
   * Creates an instance of ListManager. Use `ListManager.init()` or `ListManager.initSync()`
   * to initialize by loading from file.
   * @param path The file path to store the list.
   * @param init The initial array list.
   */
  public constructor(path: PathLike, init: string[] = []) {
    super(path, init);
  }
  public load = async (): Promise<string[]> =>
    this.queue.set(async () => {
      try {
        const raw = await fs.readFile(this.path, "utf-8"); // 123456789\n987654321
        return (this.__cache = raw
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)); // ["123456789", "987654321"]
      } catch (e: unknown) {
        if (isFSError(e) && e.code === "ENOENT") return [];
        throw e;
      }
    });
  public loadSync(): string[] {
    try {
      const raw = readFileSync(this.path, "utf-8"); // 123456789\n987654321
      return (this.__cache = raw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)); // ["123456789", "987654321"]
    } catch (e: unknown) {
      if (isFSError(e) && e.code === "ENOENT") return [];
      throw e;
    }
  }
  public save = async (): Promise<void> =>
    this.queue.set(async () => {
      const uniq = Array.from(new Set(this.cache.map((s) => s.trim()).filter(Boolean)));
      const tmpPath = this.path + ".tmp";
      await fs.writeFile(tmpPath, uniq.join("\n"), "utf8");
      await fs.rename(tmpPath, this.path);
    });
  public has = (text: string): boolean => this.cache.includes(text);
  public async add(text: string): Promise<void> {
    if (!this.has(text)) this.__cache.push(text);
    return this.save();
  }
  public async delete(text: string): Promise<void> {
    this.__cache = this.__cache.filter((cachedId) => cachedId !== text);
    return this.save();
  }
}

export class RecordFileManager<V> extends IOCacheManager<Record<string, V>> {
  /**
   * Creates an instance of RecordManager by loading from file asynchronously.
   * @param path The file path to store the record.
   */
  public static async init<V>(path: PathLike): Promise<RecordFileManager<V>> {
    const instance = new RecordFileManager<V>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of RecordManager by loading from file synchronously.
   * @param path The file path to store the record.
   */
  public static initSync<V>(path: PathLike): RecordFileManager<V> {
    const instance = new RecordFileManager<V>(path);
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of RecordManager. Use `RecordManager.init()` or `RecordManager.initSync()`
   * to initialize by loading from file.
   * @param path The file path to store the record.
   * @param init The initial record object.
   */
  public constructor(path: PathLike, init: Record<string, V> = {}) {
    super(path, init);
  }

  public load = async (): Promise<Record<string, V>> =>
    this.queue.set(async () => {
      try {
        const raw = await fs.readFile(this.path, "utf-8");
        return (this.__cache = JSON.parse(raw));
      } catch (e: unknown) {
        if (isFSError(e) && e.code === "ENOENT") return {};
        throw e;
      }
    });
  public loadSync(): Record<string, V> {
    try {
      const raw = readFileSync(this.path, "utf-8");
      return (this.__cache = JSON.parse(raw));
    } catch (e: unknown) {
      if (isFSError(e) && e.code === "ENOENT") return {};
      throw e;
    }
  }
  public save = async (): Promise<void> =>
    this.queue.set(async () => {
      const tmpPath = this.path + ".tmp";
      await fs.writeFile(tmpPath, JSON.stringify(this.cache, null, 2));
      await fs.rename(tmpPath, this.path);
    });
  public hasProperty = (key: string): boolean => this.cache.hasOwnProperty(key);
  public async set(key: string, value: V): Promise<void> {
    this.__cache[key] = value;
    return this.save();
  }
  public async add(key: string, value: V): Promise<void> {
    if (!this.hasProperty(key)) this.set(key, value);
  }
  public async delete(key: string): Promise<void> {
    delete this.__cache[key];
    return this.save();
  }
}

export class MapFileManager<V> extends IOCacheManager<Map<string, V>> {
  public static async init<V>(path: PathLike): Promise<MapFileManager<V>> {
    const instance = new MapFileManager<V>(path);
    await instance.load();
    return instance;
  }
  public static initSync<V>(path: PathLike): MapFileManager<V> {
    const instance = new MapFileManager<V>(path);
    instance.loadSync();
    return instance;
  }
  public constructor(path: PathLike, init: Map<string, V> = new Map()) {
    super(path, init);
  }

  public load = async (): Promise<Map<string, V>> =>
    this.queue.set(async () => {
      try {
        const raw = await fs.readFile(this.path, "utf-8");
        const obj: Record<string, V> = JSON.parse(raw);
        return (this.__cache = new Map(Object.entries(obj)));
      } catch (e: unknown) {
        if (isFSError(e) && e.code === "ENOENT") return new Map();
        throw e;
      }
    });
  public loadSync(): Map<string, V> {
    try {
      const raw = readFileSync(this.path, "utf-8");
      const obj: Record<string, V> = JSON.parse(raw);
      return (this.__cache = new Map(Object.entries(obj)));
    } catch (e: unknown) {
      if (isFSError(e) && e.code === "ENOENT") return new Map();
      throw e;
    }
  }
  public save = async (): Promise<void> =>
    this.queue.set(async () => {
      const tmpPath = `${this.path.toString()}.tmp`;
      const obj = Object.fromEntries(this.cache);
      await fs.writeFile(tmpPath, JSON.stringify(obj, null, 2));
      await fs.rename(tmpPath, this.path);
    });
  public hasProperty = (key: string): boolean => this.cache.has(key);
  public async set(key: string, value: V): Promise<void> {
    this.__cache.set(key, value);
    return this.save();
  }
  public async add(key: string, value: V): Promise<void> {
    if (!this.hasProperty(key)) this.set(key, value);
  }
  public async delete(key: string): Promise<void> {
    this.__cache.delete(key);
    return this.save();
  }
}
