export type JSONParsable =
  | string
  | number
  | boolean
  | { [key: string]: JSONParsable }
  | Array<JSONParsable>
  | null;
