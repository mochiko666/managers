# Installation
npm i @mochiko666/managers
# Environments
node v25.2.0
npm 11.6.2
typescript@5.9.3
just see package.json/tsconfig
# Example
```ts
import path from "path";
import { RecordFileManager, MapFileManager } from "managers";
import { User } from "../types/user.js";
const usersPath = path.join(process.cwd(), "cache", "users.json");
const manager = await MapFileManager.init<User>(usersPath);
await manager.add("user666", { id: 666, name: "user666" });

// if you want to initialize manager with empty cache, just use constructor
const emptyCache = new RecordFileManager.init<User>(usersPath);
console.log(emptyCache.cache); // {}
```
