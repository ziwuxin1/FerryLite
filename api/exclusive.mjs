import { createExclusiveHandler } from '../server/exclusive-handler.mjs';
export default { fetch: createExclusiveHandler() };
