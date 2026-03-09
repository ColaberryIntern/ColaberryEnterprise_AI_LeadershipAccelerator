import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { env } from '../config/env';

class IntelligenceProxyService {
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.INTELLIGENCE_ENGINE_URL || 'http://localhost:5000';
    this.client = axios.create({
      baseURL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getHealth(): Promise<AxiosResponse> {
    return this.client.get('/health');
  }

  async runDiscovery(): Promise<AxiosResponse> {
    return this.client.post('/discovery/run');
  }

  async getDictionary(): Promise<AxiosResponse> {
    return this.client.get('/discovery/dictionary');
  }

  async generateViews(): Promise<AxiosResponse> {
    return this.client.post('/discovery/views');
  }

  async queryOrchestrator(payload: { question: string; scope?: Record<string, any> }): Promise<AxiosResponse> {
    return this.client.post('/orchestrator/query', payload);
  }

  async getExecutiveSummary(): Promise<AxiosResponse> {
    return this.client.get('/orchestrator/executive-summary');
  }

  async getRankedInsights(): Promise<AxiosResponse> {
    return this.client.get('/orchestrator/ranked-insights');
  }

  async getEntityNetwork(): Promise<AxiosResponse> {
    return this.client.get('/orchestrator/entity-network');
  }

  async embedPipeline(): Promise<AxiosResponse> {
    return this.client.post('/vectors/embed-pipeline');
  }

  async semanticSearch(query: string, limit?: number): Promise<AxiosResponse> {
    return this.client.post('/vectors/search', { query, limit: limit || 10 });
  }

  async getAnomalies(): Promise<AxiosResponse> {
    return this.client.get('/ml/anomaly');
  }

  async getForecast(params: Record<string, any>): Promise<AxiosResponse> {
    return this.client.get('/ml/forecast', { params });
  }

  async getRiskScores(): Promise<AxiosResponse> {
    return this.client.get('/ml/risk-score');
  }
}

export const intelligenceProxy = new IntelligenceProxyService();
