import { Layer } from 'effect';
import { ConfigService } from '../config/config.js';
import { OutputService } from '../document/output-service.js';

/**
 * The services that do IO and that the contract harness replaces.
 */
export const generatorServicesLayer = Layer.mergeAll(
  ConfigService.Default,
  OutputService.Default,
);
