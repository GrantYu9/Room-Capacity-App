import { readConfig } from './config.js';
import { createPool } from './database.js';
import { createStore } from './store.js';
import { createHandler } from './handler.js';

export const config = readConfig();
export const pool = createPool(config);
export const handler = createHandler(createStore(pool), config);
