export * from './strategies.service';
import { StrategiesService } from './strategies.service';
export * from './strategies.serviceInterface';
export * from './strategyTrail.service';
import { StrategyTrailService } from './strategyTrail.service';
export * from './strategyTrail.serviceInterface';
export const APIS = [StrategiesService, StrategyTrailService];
