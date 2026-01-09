export const isFSError = (v: any | unknown): v is NodeJS.ErrnoException =>
  v instanceof Error && "errno" in v && "code" in v && "path" in v && "syscall" in v;