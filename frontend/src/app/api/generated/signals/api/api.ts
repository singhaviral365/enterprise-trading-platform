export * from './assistant.service';
import { AssistantService } from './assistant.service';
export * from './assistant.serviceInterface';
export * from './signals.service';
import { SignalsService } from './signals.service';
export * from './signals.serviceInterface';
export const APIS = [AssistantService, SignalsService];
