import {createExclusiveHandler} from '../server/exclusive-handler.mjs';
import {validateOverseasBundle} from '../src/overseas-data.ts';
export default {fetch:createExclusiveHandler(process.env,{
  codeKey:'FERRYLITE_OVERSEAS_CODE',bundleKey:'FERRYLITE_OVERSEAS_NODES_JSON',validate:validateOverseasBundle,
})};
