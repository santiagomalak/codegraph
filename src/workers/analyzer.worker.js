import { expose } from 'comlink';
import { CodeAnalyzer } from '@core/analyzer.js';

const analyzer = new CodeAnalyzer();

expose({
  async analyzeFiles(fileList) {
    const result = await analyzer.analyzeFiles(fileList);
    return result.files;
  },
});
