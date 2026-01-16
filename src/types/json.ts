export type JSONParsable =
  | string
  | number
  | boolean
  | {
      [K in keyof any]: JSONParsable;
    }
  | Array<JSONParsable>
  | null;

export type JSONParsed<T> = T extends string | number | boolean | null
  ? T
  : T extends Array<infer U>
  ? JSONParsed<U>[]
  : T extends object
  ? { [K in keyof T]: JSONParsed<T[K]> }
  : never;
