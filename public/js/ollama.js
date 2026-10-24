/**
 * SloanAI Ollama Client
 * Manages streaming connection to local Ollama inference server
 * and computes saved effort metrics.
 */

class OllamaClient {
  constructor() {
    this.status = 'unknown'; // 'online' | 'offline'
    this.models = [];
    this.activeModel = 'qwen2.5:1.5b';
    this.isGenerating = false;
    this.abortController = null;
  }

  // Check Ollama connection status and available models
  async checkStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.status = data.status;
      this.models = data.models || [];
      if (data.defaultModel) {
        this.activeModel = data.defaultModel;
      }
      return data;
    } catch (err) {
      this.status = 'offline';
      return { status: 'offline', error: err.message, models: [] };
    }
  }

  // Stream text generation from local open-weight model
  async generateStream({ prompt, system, model, temperature, onToken, onDone, onError }) {
    if (this.isGenerating) {
      this.abort();
    }

    this.isGenerating = true;
    this.abortController = new AbortController();

    const selectedModel = model || this.activeModel;

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt,
          system,
          temperature: temperature ?? 0.6
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataContent = trimmed.replace(/^data:\s*/, '');
          if (dataContent === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(dataContent);
            if (parsed.token) {
              accumulatedText += parsed.token;
              if (onToken) onToken(parsed.token, accumulatedText);
            }
          } catch (e) {
            // Partial JSON chunk
          }
        }
      }

      this.isGenerating = false;
      if (onDone) onDone(accumulatedText);
      return accumulatedText;

    } catch (err) {
      this.isGenerating = false;
      if (err.name === 'AbortError') {
        console.log('Generation paused by user.');
        return;
      }
      console.error('Inference error:', err);
      if (onError) onError(err);
      throw err;
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.isGenerating = false;
    }
  }
}

// Global singleton instance
window.ollamaClient = new OllamaClient();
