/**
 * PluginRegistry - Gestión centralizada de plugins
 * Registro, inicialización, ciclo de vida y API de acceso
 */

import {
  PluginManifest,
  PluginContext,
  PluginRegistry as PluginRegistryType,
  PluginType,
  HookName,
  HookCallback,
  PluginLogger,
  ParserPlugin,
  RulePlugin,
  ExporterPlugin,
  PluginConfig,
  PluginMetadata,
} from './index.ts';

export class PluginRegistry {
  private plugins: PluginRegistryType = new Map();
  private contexts: Map<string, PluginContext> = new Map();
  private hooks: Map<HookName, HookCallback[]> = new Map();
  private config: Map<string, PluginConfig> = new Map();
  private logger: PluginLogger;

  constructor() {
    this.logger = this._createLogger();
    this._initHooks();
  }

  private _initHooks() {
    const hookNames: HookName[] = [
      'onFileAnalyzed',
      'onGraphBuilt',
      'onExport',
      'onAnalysisStart',
      'onAnalysisComplete',
      'onError',
    ];
    for (const hook of hookNames) {
      this.hooks.set(hook, []);
    }
  }

  private _createLogger(): PluginLogger {
    return {
      info: (msg, meta) => this._log('INFO', msg, meta),
      warn: (msg, meta) => this._log('WARN', msg, meta),
      error: (msg, meta) => this._log('ERROR', msg, meta),
      debug: (msg, meta) => this._log('DEBUG', msg, meta),
    };
  }

  private _log(level: string, msg: string, meta?: Record<string, unknown>): void {
    const prefix = '[Plugin]';
    const output = meta
      ? `${prefix} ${level}: ${msg} ${JSON.stringify(meta)}`
      : `${prefix} ${level}: ${msg}`;
    switch (level) {
      case 'INFO':
        this._safeConsole('info', output);
        break;
      case 'WARN':
        this._safeConsole('warn', output);
        break;
      case 'ERROR':
        this._safeConsole('error', output);
        break;
      case 'DEBUG':
        this._safeConsole('debug', output);
        break;
    }
  }

  private _safeConsole(method: 'info' | 'warn' | 'error' | 'debug', output: string): void {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined' && console[method]) {
      // eslint-disable-next-line no-console
      console[method](output);
    }
  }

  /**
   * Registra un plugin en el registry
   */
  async register(manifest: PluginManifest): Promise<void> {
    const { metadata } = manifest;

    if (this.plugins.has(metadata.name)) {
      throw new Error(`Plugin "${metadata.name}" ya está registrado`);
    }

    // Validar metadata
    this._validateMetadata(metadata);

    // Crear contexto para este plugin
    const context = this._createContext(metadata.name);

    this.plugins.set(metadata.name, manifest);
    this.contexts.set(metadata.name, context);
    this.config.set(metadata.name, { enabled: true });

    this.logger.info(`Plugin registrado: ${metadata.name} v${metadata.version} (${metadata.type})`);

    // Inicializar plugin
    try {
      await manifest.init(context);
      this.logger.info(`Plugin inicializado: ${metadata.name}`);
    } catch (err) {
      const errorMeta =
        err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) };
      this.logger.error(`Error inicializando plugin ${metadata.name}:`, errorMeta);
      this.plugins.delete(metadata.name);
      this.contexts.delete(metadata.name);
      this.config.delete(metadata.name);
      throw err;
    }
  }

  /**
   * Desregistra un plugin
   */
  async unregister(name: string): Promise<void> {
    const manifest = this.plugins.get(name);
    if (!manifest) return;

    if (manifest.destroy) {
      try {
        await manifest.destroy();
      } catch (err) {
        const errorMeta =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { error: String(err) };
        this.logger.error(`Error destruyendo plugin ${name}:`, errorMeta);
      }
    }

    this.plugins.delete(name);
    this.contexts.delete(name);
    this.config.delete(name);
    this.logger.info(`Plugin desregistrado: ${name}`);
  }

  /**
   * Obtiene un plugin por nombre
   */
  getPlugin(name: string): PluginManifest | undefined {
    return this.plugins.get(name);
  }

  /**
   * Lista todos los plugins registrados
   */
  getAllPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Obtiene plugins por tipo
   */
  getPluginsByType(type: PluginType): PluginManifest[] {
    return Array.from(this.plugins.values()).filter(p => p.metadata.type === type);
  }

  /**
   * Habilita/deshabilita un plugin
   */
  setEnabled(name: string, enabled: boolean): void {
    const cfg = this.config.get(name);
    if (cfg) {
      cfg.enabled = enabled;
      this.logger.info(`Plugin ${name} ${enabled ? 'habilitado' : 'deshabilitado'}`);
    }
  }

  /**
   * Verifica si un plugin está habilitado
   */
  isEnabled(name: string): boolean {
    return this.config.get(name)?.enabled ?? false;
  }

  /**
   * Establece configuración para un plugin
   */
  setConfig(name: string, options: Record<string, unknown>): void {
    const cfg = this.config.get(name);
    if (cfg) {
      cfg.options = { ...cfg.options, ...options };
    }
  }

  /**
   * Obtiene configuración de un plugin
   */
  getConfig(name: string): PluginConfig | undefined {
    return this.config.get(name);
  }

  getPluginConfig(name: string): Record<string, unknown> | undefined {
    return this.config.get(name)?.options as Record<string, unknown> | undefined;
  }

  // =========================
  // HOOKS
  // =========================

  on(hook: HookName, callback: HookCallback): void {
    const hooks = this.hooks.get(hook);
    if (hooks) {
      hooks.push(callback);
    }
  }

  off(hook: HookName, callback: HookCallback): void {
    const hooks = this.hooks.get(hook);
    if (hooks) {
      const idx = hooks.indexOf(callback);
      if (idx !== -1) hooks.splice(idx, 1);
    }
  }

  async emit(hook: HookName, data: unknown): Promise<void> {
    const hooks = this.hooks.get(hook) ?? [];
    const context = this._createGlobalContext();

    for (const callback of hooks) {
      try {
        await callback(data, context);
      } catch (err) {
        const errorMeta =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { error: String(err) };
        this.logger.error(`Error en hook ${hook}:`, errorMeta);
      }
    }
  }

  // =========================
  // CONTEXT CREATION
  // =========================

  private _createContext(pluginName: string): PluginContext {
    return {
      registerParser: (parser: ParserPlugin) => {
        this._registerExternalParser(parser);
      },
      getParser: (ext: string) => this._getExternalParser(ext),
      getAllParsers: () => this._getAllExternalParsers(),

      registerRule: (rule: RulePlugin) => {
        this._registerExternalRule(rule);
      },
      getRules: (lang?: string) => this._getExternalRules(lang),
      getAllRules: () => this._getAllExternalRules(),

      registerExporter: (exporter: ExporterPlugin) => {
        this._registerExternalExporter(exporter);
      },
      getExporter: (name: string) => this._getExternalExporter(name),
      getAllExporters: () => this._getAllExternalExporters(),

      on: (hook: HookName, callback: HookCallback) => this.on(hook, callback),
      off: (hook: HookName, callback: HookCallback) => this.off(hook, callback),
      emit: (hook: HookName, data: unknown) => this.emit(hook, data),

      logger: this.logger,
      config: (this.config.get(pluginName)?.options ?? {}) as Record<string, unknown>,
    };
  }

  private _createGlobalContext(): PluginContext {
    return this._createContext('global');
  }

  // =========================
  // EXTERNAL REGISTRY METHODS
  // (Se conectan con ParserFactory, RuleEngine, ExporterRegistry)
  // =========================

  private _externalParsers: Map<string, ParserPlugin> = new Map();
  private _externalRules: RulePlugin[] = [];
  private _externalExporters: Map<string, ExporterPlugin> = new Map();

  _registerExternalParser(parser: ParserPlugin): void {
    for (const ext of parser.extensions) {
      this._externalParsers.set(ext, parser);
    }
    this.logger.debug(`Parser registrado: ${parser.name} para [${parser.extensions.join(', ')}]`);
  }

  _getExternalParser(ext: string): ParserPlugin | undefined {
    return this._externalParsers.get(ext);
  }

  _getAllExternalParsers(): ParserPlugin[] {
    return Array.from(new Set(this._externalParsers.values()));
  }

  _registerExternalRule(rule: RulePlugin): void {
    this._externalRules.push(rule);
    this.logger.debug(`Regla registrada: ${rule.name} (${rule.id})`);
  }

  _getExternalRules(language?: string): RulePlugin[] {
    if (!language) return [...this._externalRules];
    return this._externalRules.filter(r => r.languages.includes(language));
  }

  _getAllExternalRules(): RulePlugin[] {
    return [...this._externalRules];
  }

  _registerExternalExporter(exporter: ExporterPlugin): void {
    this._externalExporters.set(exporter.name, exporter);
    this.logger.debug(`Exportador registrado: ${exporter.name}`);
  }

  _getExternalExporter(name: string): ExporterPlugin | undefined {
    return this._externalExporters.get(name);
  }

  _getAllExternalExporters(): ExporterPlugin[] {
    return Array.from(this._externalExporters.values());
  }

  // =========================
  // VALIDATION
  // =========================

  private _validateMetadata(metadata: PluginMetadata): void {
    const required = ['name', 'version', 'description', 'author', 'type', 'entryPoint'];
    for (const field of required) {
      if (!metadata[field as keyof PluginMetadata]) {
        throw new Error(`Metadata inválida: falta campo "${field}"`);
      }
    }

    const validTypes: PluginType[] = ['parser', 'rule', 'exporter', 'transformer'];
    if (!validTypes.includes(metadata.type)) {
      throw new Error(
        `Tipo de plugin inválido: ${metadata.type}. Válidos: ${validTypes.join(', ')}`
      );
    }

    // Semver básico
    if (!/^\d+\.\d+\.\d+/.test(metadata.version)) {
      throw new Error(`Versión inválida: ${metadata.version}. Usar semver (ej: 1.0.0)`);
    }
  }

  // =========================
  // CLEANUP
  // =========================

  async destroy(): Promise<void> {
    for (const name of this.plugins.keys()) {
      await this.unregister(name);
    }
    this.hooks.clear();
    this.logger.info('PluginRegistry destruido');
  }
}

// Singleton para uso global
export const pluginRegistry = new PluginRegistry();
