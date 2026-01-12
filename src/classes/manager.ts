import { readFileSync, type PathLike } from "fs";
import fs from "node:fs/promises";
import { isFSError } from "../typeguards/fs.js";
import type { JSONParsable } from "../types/json.js";
import { PromiseQueue } from "./queue.js";

export abstract class BaseCacheManager<Cache> {
  public get cache() {
    return this.__cache as Cache extends Array<infer Holds>
      ? ReadonlyArray<Holds>
      : Cache extends Set<infer Holds>
      ? ReadonlySet<Holds>
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

/**
 * A manager for the specified JSON file.
 */
export class JsonCacheManager<
  Cache extends JSONParsable | Set<JSONParsable> | Map<string, JSONParsable>
> extends FileCacheManager<Cache> {
  protected readonly queue: PromiseQueue = new PromiseQueue();
  /**
   * Reads the cache file as JSON and update the cache with the parsed content. \
   * **Make sure the cache type matches the file content.**
   * @returns A boolean indicating whether the cache has successfully been updated or not.
   */
  public async load(): Promise<boolean> {
    return this.queue.set(async () => {
      try {
        const raw = (await fs.readFile(this.path, "utf-8")).trim();
        if (!raw) return false;
        const obj = JSON.parse(raw, (key, value) => {
          if (key !== "") return value;
          if (this.__cache instanceof Set) {
            // if the cache type is Set, transforms the array to a Set.
            if (!Array.isArray(value)) throw new Error("Expected an array or empty for Set Cache.");
            return new Set(value);
          } else if (this.__cache instanceof Map) {
            // if the cache type is Map, transforms the object to a Map.
            if (typeof value !== "object" || value === null || Array.isArray(value))
              throw new Error("Expected an object or empty for Map Cache.");
            return new Map(Object.entries(value));
          } else if (
            typeof this.__cache !== typeof value &&
            (!Array.isArray(this.__cache) || !Array.isArray(value))
          )
            throw new Error("The file content does not match the cache type.");
          return value;
        });

        this.__cache = obj;
        return true;
      } catch (e: unknown) {
        if (isFSError(e) && e.code === "ENOENT") return false;
        throw e;
      }
    });
  }
  /**
   * Reads the cache file as JSON synchronously and update the cache with the parsed content. \
   * **Make sure the cache type matches the file content.**
   * @returns A boolean indicating whether the cache has successfully been updated or not.
   */
  public loadSync(): boolean {
    try {
      const raw = readFileSync(this.path, "utf-8").trim();
      if (!raw) return false;
      const obj = JSON.parse(raw, (key, value) => {
        if (key !== "") return value;
        if (this.__cache instanceof Set) {
          if (!Array.isArray(value)) throw new Error("Expected an array or empty for Set Cache.");
          return new Set(value);
        } else if (this.__cache instanceof Map) {
          if (typeof value !== "object" || value === null || Array.isArray(value))
            throw new Error("Expected an object or empty for Map Cache.");
          return new Map(Object.entries(value));
        } else if (
          typeof this.__cache !== typeof value &&
          (!Array.isArray(this.__cache) || !Array.isArray(value))
        )
          throw new Error("The file content does not match the cache type.");
        return value;
      });

      this.__cache = obj;
      return true;
    } catch (e: unknown) {
      if (isFSError(e) && e.code === "ENOENT") return false;
      throw e;
    }
  }
  /**
   * Saves the current cache to the path set on the manager, as a JSON formatted object.
   */
  public async save(): Promise<void> {
    return this.queue.set(async () => {
      const tmpPath = this.path + ".tmp";
      const obj =
        this.cache instanceof Set
          ? [...this.cache]
          : this.cache instanceof Map
          ? Object.fromEntries(this.cache)
          : this.cache;
      await fs.writeFile(tmpPath, JSON.stringify(obj, null, 2));
      await fs.rename(tmpPath, this.path);
    });
  }
}

export class ArrayFileManager<Cache extends JSONParsable> extends JsonCacheManager<Cache[]> {
  /**
   * Creates an instance of ArrayFileManager by loading from file asynchronously.
   * @param path The file path to store the list.
   */
  public static async init<Cache extends JSONParsable>(
    path: PathLike
  ): Promise<ArrayFileManager<Cache>> {
    const instance = new ArrayFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of ArrayFileManager by loading from file synchronously.
   * @param path The file path to store the list.
   */
  public static initSync<Cache extends JSONParsable>(path: PathLike): ArrayFileManager<Cache> {
    const instance = new ArrayFileManager<Cache>(path); // ["123456789", "987654321"]
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of ArrayFileManager. \
   * Use `ArrayFileManager.init()` or `ArrayFileManager.initSync()` to initialize by loading from file.
   * @param path The file path to store the list.
   * @param init The initial array list.
   */
  public constructor(path: PathLike, init: Cache[] = []) {
    super(path, init);
  }

  /**
   * Determines whether the cache includes a certain element, returning true or false as appropriate.
   * @param item The element to search for.
   */
  public has(item: Cache): boolean {
    return this.cache.includes(item);
  }
  /**
   * Returns the item located at the specified index.
   * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.
   */
  public get(index: number): Cache | undefined {
    return this.cache.at(index);
  }
  /**
   * Appends a new element to the end of the cache.
   * @param item The new element to add to the cache.
   * @param unique Whether to avoid duplicates or not.
   */
  public async add(item: Cache, unique: boolean = true): Promise<void> {
    if ((unique && !this.has(item)) || !unique) this.__cache.push(item);
    return this.save();
  }
  /**
   * Calls a defined callback function on each element of the cache, turning each element to the result.
   * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
   * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
   */
  public async map(
    callbackfn: (value: Cache, index: number, array: Cache[]) => Cache,
    thisArg?: any
  ): Promise<void> {
    this.__cache = this.__cache.map(callbackfn, thisArg);
    return this.save();
  }
  /**
   * Makes the cache filtered down to just the elements that meet the condition specified in a callback function.
   * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.
   * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.
   */
  public async filter(
    predicate: (value: Cache, index: number, array: Cache[]) => boolean,
    thisArg?: any
  ): Promise<void> {
    this.__cache = this.__cache.filter(predicate, thisArg);
    return this.save();
  }
  /**
   * @returns The current cache with unique values.
   */
  public distinct(): Cache[] {
    return Array.from(new Set(this.cache));
  }
}

export class SetFileManager<Cache extends JSONParsable> extends JsonCacheManager<Set<Cache>> {
  /**
   * Creates an instance of SetFileManager by loading from file asynchronously.
   * @param path The file path to store the list.
   */
  public static async init<Cache extends JSONParsable>(
    path: PathLike
  ): Promise<SetFileManager<Cache>> {
    const instance = new SetFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of SetFileManager by loading from file synchronously.
   * @param path The file path to store the list.
   */
  public static initSync<Cache extends JSONParsable>(path: PathLike): SetFileManager<Cache> {
    const instance = new SetFileManager<Cache>(path); // ["123456789", "987654321"]
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of ArrayFileManager. \
   * Use `ArrayFileManager.init()` or `ArrayFileManager.initSync()` to initialize by loading from file.
   * @param path The file path to store the list.
   * @param init The initial array list.
   */
  public constructor(path: PathLike, init: Set<Cache> = new Set()) {
    super(path, init);
  }

  /**
   * Determines whether the cache includes a certain element, returning true or false as appropriate.
   * @param item The element to search for.
   */
  public has(item: Cache): boolean {
    return this.cache.has(item);
  }
  /**
   * Returns the item located at the specified index.
   * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.
   */
  public get(index: number): Cache | undefined {
    return [...this.cache].at(index);
  }
  /**
   * Appends a new element with a specified value to the end of the cache.
   * @param value The new element to add to the cache.
   * @param unique Whether to avoid duplicates or not.
   * @returns
   */
  public async add(value: Cache): Promise<void> {
    this.__cache.add(value);
    return this.save();
  }
  /**
   * Removes a specified value from the cache.
   * @param value The value to remove from the cache.
   * @returns
   */
  public async delete(value: Cache): Promise<void> {
    this.__cache.delete(value);
    return this.save();
  }
  /**
   * Calls a defined callback function on each element of the cache, turning each element to the result.
   * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
   * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
   */
  public async map(
    callbackfn: (value: Cache, index: number, array: Cache[]) => Cache,
    thisArg?: any
  ): Promise<void> {
    this.__cache = new Set([...this.__cache].map(callbackfn, thisArg));
    return this.save();
  }
  /**
   * Makes the cache filtered down to just the elements that meet the condition specified in a callback function.
   * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.
   * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.
   */
  public async filter(
    predicate: (value: Cache, index: number, array: Cache[]) => boolean,
    thisArg?: any
  ): Promise<void> {
    this.__cache = new Set([...this.__cache].filter(predicate, thisArg));
    return this.save();
  }
}

export class RecordFileManager<Cache extends JSONParsable> extends JsonCacheManager<
  Record<string, Cache>
> {
  /**
   * Creates an instance of RecordManager by loading from file asynchronously.
   * @param path The file path to store the record.
   */
  public static async init<Cache extends JSONParsable>(
    path: PathLike
  ): Promise<RecordFileManager<Cache>> {
    const instance = new RecordFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of RecordManager by loading from file synchronously.
   * @param path The file path to store the record.
   */
  public static initSync<Cache extends JSONParsable>(path: PathLike): RecordFileManager<Cache> {
    const instance = new RecordFileManager<Cache>(path);
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of RecordManager. Use `RecordFileManager.init()` or `RecordFileManager.initSync()`
   * to initialize by loading from file.
   * @param path The file path to store the record.
   * @param init The initial record object.
   */
  public constructor(path: PathLike, init: Record<string, Cache> = {}) {
    super(path, init);
  }
  /**
   * Determines whether the cache has a property with the specified name.
   * @param key A property name.
   */
  public has(key: string): boolean {
    return this.cache.hasOwnProperty(key);
  }
  /**
   * @param key The key of the value to return from the cache.
   * @returns The element associated with the specified key. If no element is associated with the specified key, undefined is returned.
   */
  public get(key: string): Cache | undefined {
    return this.cache[key];
  }
  /**
   * Adds a new element with a specified key and value to the cache. If an element with the same key already exists, the element will be updated.
   * @param key The key of the entry to add to or modify within the cache.
   * @param value The value of the entry to add to or modify within the cache.
   */
  public async set(key: string, value: Cache): Promise<void> {
    this.__cache[key] = value;
    return this.save();
  }
  /**
   * Appends a new element with a specified key and value to the cache.
   * @param key The key of the entry to add to the cache.
   * @param value The new element to add to the cache.
   */
  public async add(key: string, value: Cache): Promise<void> {
    if (!this.has(key)) return this.set(key, value);
  }
  /**
   * Removes the entry specified by the key from the cache.
   * @param key The key of the entry to remove from the cache.
   */
  public async delete(key: string): Promise<void> {
    delete this.__cache[key];
    return this.save();
  }
}

export class MapFileManager<Cache extends JSONParsable> extends JsonCacheManager<
  Map<string, Cache>
> {
  /**
   * Creates an instance of MapFileManager by loading from file asynchronously.
   * @param path The file path to store the cache.
   */
  public static async init<Cache extends JSONParsable>(
    path: PathLike
  ): Promise<MapFileManager<Cache>> {
    const instance = new MapFileManager<Cache>(path);
    await instance.load();
    return instance;
  }
  /**
   * Creates an instance of MapFileManager by loading from file synchronously.
   * @param path The file path to store the cache.
   */
  public static initSync<Cache extends JSONParsable>(path: PathLike): MapFileManager<Cache> {
    const instance = new MapFileManager<Cache>(path);
    instance.loadSync();
    return instance;
  }
  /**
   * Creates an instance of MapFileManager. Use `MapFileManager.init()` or `MapFileManager.initSync()`
   * to initialize by loading from file.
   * @param path The file path to store the record.
   * @param init The initial map object.
   */
  public constructor(path: PathLike, init: Map<string, Cache> = new Map()) {
    super(path, init);
  }

  public async save(): Promise<void> {
    return this.queue.set(async () => {
      const tmpPath = this.path + ".tmp";
      const obj = Object.fromEntries(this.cache);
      await fs.writeFile(tmpPath, JSON.stringify(obj, null, 2));
      await fs.rename(tmpPath, this.path);
    });
  }
  /**
   * Determines whether the cache has a property with the specified name.
   * @param key The key of an entry.
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }
  /**
   * @param key The key of the value to return from the cache.
   * @returns The element associated with the specified key. If no element is associated with the specified key, undefined is returned.
   */
  public get(key: string): Cache | undefined {
    return this.cache.get(key);
  }
  /**
   * Adds a new element with a specified key and value to the cache. If an element with the same key already exists, the element will be updated.
   * @param key The key of the entry to add to or modify within the cache.
   * @param value The value of the entry to add to or modify within the cache.
   */
  public async set(key: string, value: Cache): Promise<void> {
    this.__cache.set(key, value);
    return this.save();
  }
  /**
   * Appends a new element with a specified key and value to the cache.
   * @param key The key of the entry to add to the cache.
   * @param value The new element to add to the cache.
   */
  public async add(key: string, value: Cache): Promise<void> {
    if (!this.has(key)) this.set(key, value);
  }
  /**
   * Removes the entry specified by the key from the cache.
   * @param key The key of the entry to remove from the cache.
   */
  public async delete(key: string): Promise<void> {
    this.__cache.delete(key);
    return this.save();
  }
}
