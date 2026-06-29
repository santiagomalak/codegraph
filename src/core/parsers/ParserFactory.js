import { JavaScriptParser } from './JavaScriptParser.js';
import { TypeScriptParser } from './TypeScriptParser.js';
import { PythonParser } from './PythonParser.js';
import { CssParser } from './CssParser.js';

export class ParserFactory {
  constructor() {
    this.parsers = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.registerParser(new JavaScriptParser());
    this.registerParser(new TypeScriptParser());
    this.registerParser(new PythonParser());
    this.registerParser(new CssParser());
  }

  registerParser(parser) {
    for (const ext of parser.extensions) {
      this.parsers.set(ext, parser);
    }
  }

  getParser(extension) {
    return this.parsers.get(extension.toLowerCase()) || null;
  }

  getParserByLanguage(language) {
    for (const parser of this.parsers.values()) {
      if (parser.language.toLowerCase() === language.toLowerCase()) return parser;
    }
    return null;
  }

  getSupportedExtensions() {
    return [...new Set([...this.parsers.keys()])];
  }
}

export const parserFactory = new ParserFactory();
