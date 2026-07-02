/**
 * PluginContext - API pública expuesta a los plugins
 * Proporciona acceso controlado a funcionalidades del core
 */

import {
  ParserPlugin,
  RulePlugin,
  ExporterPlugin,
  HookName,
  HookCallback,
  PluginContext,
} from './index.js';

/**
 * Crea un contexto aislado para un plugin específico
 */
export function createPluginContext(
  pluginName: string,
  registry: PluginRegistryInterface
): PluginContext {
  return {
    // Parser registry
    registerParser: (parser: ParserPlugin) => registry.registerParser(parser),
    getParser: (ext: string) => registry.getParser(ext),
    getAllParsers: () => registry.getAllParsers(),

    // Rule registry
    registerRule: (rule: RulePlugin) => registry.registerRule(rule),
    getRules: (language?: string) => registry.getRules(language),
    getAllRules: () => registry.getAllRules(),

    // Exporter registry
    registerExporter: (exporter: ExporterPlugin) => registry.registerExporter(exporter),
    getExporter: (name: string) => registry.getExporter(name),
    getAllExporters: () => registry.getAllExporters(),

    // Event hooks
    on: (hook: HookName, callback: HookCallback) => registry.on(hook, callback),
    off: (hook: HookName, callback: HookCallback) => registry.off(hook, callback),
    emit: (hook: HookName, data: unknown) => registry.emit(hook, data),

    // Logger
    logger: registry.logger,

    // Config del plugin
    config: registry.getPluginConfig(pluginName) ?? {},
  };
}

// Interface para tipar el registry (evita dependencia circular)
interface PluginRegistryInterface {
  registerParser: (parser: ParserPlugin) => void;
  getParser: (ext: string) => ParserPlugin | undefined;
  getAllParsers: () => ParserPlugin[];
  registerRule: (rule: RulePlugin) => void;
  getRules: (language?: string) => RulePlugin[];
  getAllRules: () => RulePlugin[];
  registerExporter: (exporter: ExporterPlugin) => void;
  getExporter: (name: string) => ExporterPlugin | undefined;
  getAllExporters: () => ExporterPlugin[];
  on: (hook: HookName, callback: HookCallback) => void;
  off: (hook: HookName, callback: HookCallback) => void;
  emit: (hook: HookName, data: unknown) => Promise<void>;
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  getPluginConfig: (name: string) => Record<string, unknown> | undefined;
}
