/**
 * Solver Interface - Type-safe wrapper for Web Worker communication
 *
 * Usage:
 *   const solver = new SolverInterface();
 *   await solver.initialize();
 *   const results = await solver.runAnalysis(modelData);
 */

import type {
  ModelData,
  AnalysisResults,
  AnalysisType,
  LoadCombination,
  WorkerMessage,
  WorkerMessageType,
  WorkerError,
} from './types';

export class SolverInterface {
  private worker: Worker | null = null;
  private isInitialized = false;
  private messageQueue = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private messageIdCounter = 0;

  /**
   * Initialize the worker and load PyNite
   * This should be called once on app startup
   *
   * @returns Promise that resolves when worker is ready
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[SolverInterface] Already initialized');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Create worker with proper module resolution
        this.worker = new Worker(new URL('/workers/solverWorker.js', import.meta.url), { type: 'module' });

        // Setup message handler
        this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
          this.handleWorkerMessage(e.data);
        };

        // Setup error handler
        this.worker.onerror = (error: ErrorEvent) => {
          console.error('[SolverInterface] Worker error:', error);
          reject(new Error(`Worker error: ${error.message}`));
        };

        // Send init message
        const msgId = this.sendMessage('init');

        // Wait for ready response
        this.messageQueue.set(msgId, {
          resolve: () => {
            this.isInitialized = true;
            console.log('[SolverInterface] Worker initialized successfully');
            resolve();
          },
          reject,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Run structural analysis
   *
   * @param modelData - Model geometry, elements, and loads
   * @param analysisType - Type of analysis (default: 'simple')
   * @param targetName - Load case name or combination object
   * @returns Analysis results with all values in engineering units
   */
  async runAnalysis(
    modelData: ModelData,
    analysisType: AnalysisType = 'simple',
    targetName?: string | LoadCombination
  ): Promise<AnalysisResults> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized. Call initialize() first.');
    }

    return new Promise((resolve, reject) => {
      const msgId = this.sendMessage('analyze', {
        modelData,
        analysisType,
        targetName,
      });

      this.messageQueue.set(msgId, { resolve, reject });
    });
  }

  /**
   * Ping the worker to check if it's alive
   */
  async ping(): Promise<{ initialized: boolean }> {
    if (!this.worker) {
      throw new Error('Worker not created');
    }

    return new Promise((resolve, reject) => {
      const msgId = this.sendMessage('ping');
      this.messageQueue.set(msgId, { resolve, reject });
    });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.messageQueue.clear();
      console.log('[SolverInterface] Worker terminated');
    }
  }

  /**
   * Send message to worker
   */
  private sendMessage(type: WorkerMessageType, payload?: any): string {
    if (!this.worker) {
      throw new Error('Worker not created');
    }

    const msgId = `msg_${++this.messageIdCounter}`;
    const message: WorkerMessage = { type, payload, msgId };

    this.worker.postMessage(message);
    return msgId;
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    const { type, payload, msgId } = message;

    if (!msgId) {
      console.warn('[SolverInterface] Received message without msgId:', message);
      return;
    }

    const pending = this.messageQueue.get(msgId);
    if (!pending) {
      console.warn('[SolverInterface] No pending request for msgId:', msgId);
      return;
    }

    // Remove from queue
    this.messageQueue.delete(msgId);

    // Handle response
    switch (type) {
      case 'ready':
        pending.resolve(payload);
        break;

      case 'results':
        pending.resolve(payload as AnalysisResults);
        break;

      case 'pong':
        pending.resolve(payload);
        break;

      case 'error':
        const error = payload as WorkerError;
        pending.reject(new Error(error.message));
        break;

      default:
        console.warn('[SolverInterface] Unknown message type:', type);
        pending.reject(new Error(`Unknown message type: ${type}`));
    }
  }

  /**
   * Get initialization status
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance (optional - can be instantiated per-use instead)
let solverInstance: SolverInterface | null = null;

export function getSolverInstance(): SolverInterface {
  if (!solverInstance) {
    solverInstance = new SolverInterface();
  }
  return solverInstance;
}

export function resetSolverInstance(): void {
  if (solverInstance) {
    solverInstance.terminate();
    solverInstance = null;
  }
}
