/**
 * SloanAI Main Application Logic
 * Integrates UI tabs, local streaming inference, energy metrics, and soundscapes.
 */

// Energy Conserved State Manager
const EnergyTracker = {
  getStats() {
    try {
      const data = JSON.parse(localStorage.getItem('sloan_energy_stats') || '{}');
      return {
        minutesSaved: data.minutesSaved || 42,
        wordsSkipped: data.wordsSkipped || 1850,
        repliesDrafted: data.repliesDrafted || 14
      };
    } catch {
      return { minutesSaved: 42, wordsSkipped: 1850, repliesDrafted: 14 };
    }
  },

  addSavings({ wordsInput, wordsOutput, replies = 0 }) {
    const stats = this.getStats();
    const wordsSaved = Math.max(0, wordsInput - wordsOutput);
    const readingMinutes = Math.max(1, Math.round(wordsSaved / 180));

    stats.wordsSkipped += wordsSaved;
    stats.minutesSaved += readingMinutes;
    stats.repliesDrafted += replies;

    localStorage.setItem('sloan_energy_stats', JSON.stringify(stats));
    this.render();
  },

  render() {
    const stats = this.getStats();
    const minEl = document.getElementById('stat-minutes');
    const wordsEl = document.getElementById('stat-words');
    const repliesEl = document.getElementById('stat-replies');

    if (minEl) minEl.innerText = stats.minutesSaved;
    if (wordsEl) wordsEl.innerText = stats.wordsSkipped.toLocaleString();
    if (repliesEl) repliesEl.innerText = stats.repliesDrafted;
  }
};

// UI Helper: Render Markdown basics safely
function renderSimpleMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks ```...```
  html = html.replace(/```([a-z0-9]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div class="code-block-wrapper"><div class="code-header"><span>${lang || 'script'}</span><button class="copy-snippet-btn" onclick="copyText(this)">Copy Code</button></div><pre><code>${code.trim()}</code></pre></div>`;
  });

  // Inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h4 class="md-h3">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 class="md-h2">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 class="md-h1">$1</h2>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Bullet items
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Line breaks
  html = html.replace(/\n\n/g, '<p></p>');

  return html;
}

// Global copy helper with visual feedback
window.copyText = function(btnOrText, rawText) {
  let textToCopy = '';
  let buttonEl = null;

  if (typeof btnOrText === 'string') {
    textToCopy = btnOrText;
  } else if (btnOrText instanceof HTMLElement) {
    buttonEl = btnOrText;
    if (rawText) {
      textToCopy = rawText;
    } else {
      const codeEl = buttonEl.closest('.code-block-wrapper')?.querySelector('code');
      textToCopy = codeEl ? codeEl.innerText : buttonEl.getAttribute('data-copy') || '';
    }
  }

  if (textToCopy) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Copied to clipboard! Energy conserved: 100% 🦥');
      if (buttonEl) {
        const orig = buttonEl.innerText;
        buttonEl.innerText = '✓ Copied!';
        buttonEl.classList.add('copied');
        setTimeout(() => {
          buttonEl.innerText = orig;
          buttonEl.classList.remove('copied');
        }, 2000);
      }
    });
  }
};

// Toast Notification
function showToast(msg) {
  let toast = document.getElementById('sloan-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sloan-toast';
    toast.className = 'sloan-toast';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  EnergyTracker.render();

  // 1. Check Ollama Status & populate model dropdown
  const statusPill = document.getElementById('ollama-status-pill');
  const modelSelect = document.getElementById('model-select');

  try {
    const statusData = await window.ollamaClient.checkStatus();
    if (statusData.status === 'online') {
      statusPill.className = 'status-pill online';
      statusPill.innerHTML = '<span class="status-dot"></span> Ollama: Online (100% Offline AI)';

      if (modelSelect && statusData.models.length > 0) {
        modelSelect.innerHTML = '';
        statusData.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.innerText = `${m.name} (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)`;
          if (m.name === statusData.defaultModel) opt.selected = true;
          modelSelect.appendChild(opt);
        });
      }
    } else {
      statusPill.className = 'status-pill offline';
      statusPill.innerHTML = '<span class="status-dot"></span> Ollama: Waiting on localhost:11434';
    }
  } catch (err) {
    statusPill.className = 'status-pill offline';
    statusPill.innerHTML = '<span class="status-dot"></span> Ollama: Offline';
  }

  // Model change handler
  if (modelSelect) {
    modelSelect.addEventListener('change', (e) => {
      window.ollamaClient.activeModel = e.target.value;
      showToast(`Model switched to ${e.target.value}`);
    });
  }

  // 2. Tab Navigation
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(`tab-${tabId}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // 3. Module 1: Chat Condenser Setup
  setupChatModule();

  // 4. Module 2: Wind-Down & Soundscape Sanctuary Setup
  setupSoundscapeModule();

  // 5. Module 3: Lazy Declutterer Setup
  setupDeclutterModule();

  // 6. Module 4: Fridge to Feast Setup
  setupFridgeModule();
});

/* -------------------------------------------------------------
 * MODULE 1: The 2-Minute Lazy Catchup (Chat Condenser)
 * ------------------------------------------------------------- */
function setupChatModule() {
  const inputEl = document.getElementById('chat-input');
  const submitBtn = document.getElementById('chat-submit-btn');
  const outputEl = document.getElementById('chat-output');
  const repliesContainer = document.getElementById('lazy-replies-container');
  const sampleSlackBtn = document.getElementById('sample-slack-btn');
  const sampleFamilyBtn = document.getElementById('sample-family-btn');
  const sampleEmailBtn = document.getElementById('sample-email-btn');

  // Preset loaders
  if (sampleSlackBtn) {
    sampleSlackBtn.addEventListener('click', () => {
      inputEl.value = window.SLOAN_SAMPLES.chat.slackThread;
      showToast('Loaded 16-message Project Slack Thread');
    });
  }
  if (sampleFamilyBtn) {
    sampleFamilyBtn.addEventListener('click', () => {
      inputEl.value = window.SLOAN_SAMPLES.chat.whatsappFamily;
      showToast('Loaded WhatsApp Group Chat');
    });
  }
  if (sampleEmailBtn) {
    sampleEmailBtn.addEventListener('click', () => {
      inputEl.value = window.SLOAN_SAMPLES.chat.emailChain;
      showToast('Loaded HR Policy Email');
    });
  }

  // Action: Condense
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const text = (inputEl.value || '').trim();
      if (!text) {
        showToast('Please paste a chat thread or select a sample preset first.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Sloth is Reading Slowly...';
      outputEl.innerHTML = '<div class="streaming-placeholder">🦥 Sloan is filtering out 90% of the noise...</div>';
      if (repliesContainer) repliesContainer.innerHTML = '';

      const systemPrompt = `You are Sloan, an ultra-calm AI sloth who helps people be lazy by filtering noise from group chats and email threads.
Analyze the provided messages and output exactly this structured format:

### 🦥 The Sloth Verdict (2 lines max)
Summarize what actually happened.

### 🗑️ What You Can Safely Ignore
Bullet points of chit-chat, arguments, food orders, and noise.

### ⚡ Critical Action Items For You (If any)
Only what requires immediate action, ranked by lowest effort. If none, write "None! Go back to relaxing."

### 💬 1-Click Lazy Replies
Provide 3 short, polite, effortless pre-drafted replies (e.g. "Approved!", "Thanks, catching up next week", "Sounds great").
Format each reply on its own line starting with: REPLY: <text>`;

      const userPrompt = `Here is the messy chat log to condense:\n\n${text}`;

      let fullResponse = '';
      try {
        await window.ollamaClient.generateStream({
          prompt: userPrompt,
          system: systemPrompt,
          temperature: 0.5,
          onToken: (token, accum) => {
            fullResponse = accum;
            outputEl.innerHTML = renderSimpleMarkdown(accum);
          },
          onDone: (finalText) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🦥 Condense Chat (Lazy Mode)';

            // Extract pre-drafted replies and render instant buttons
            extractAndRenderReplies(finalText, repliesContainer);

            // Add to energy score
            const inWords = text.split(/\s+/).length;
            const outWords = finalText.split(/\s+/).length;
            EnergyTracker.addSavings({ wordsInput: inWords, wordsOutput: outWords, replies: 3 });
          },
          onError: (err) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🦥 Condense Chat (Lazy Mode)';
            outputEl.innerHTML = `<div class="error-banner">Inference error: ${err.message}. Ensure Ollama is running on localhost:11434 with model ${window.ollamaClient.activeModel}.</div>`;
          }
        });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🦥 Condense Chat (Lazy Mode)';
      }
    });
  }
}

function extractAndRenderReplies(text, container) {
  if (!container) return;
  const replyLines = text.split('\n')
    .filter(l => l.includes('REPLY:'))
    .map(l => l.replace(/.*REPLY:\s*["']?/, '').replace(/["']?$/, '').trim())
    .filter(Boolean);

  if (replyLines.length === 0) return;

  container.innerHTML = '<div class="replies-header"><strong>⚡ 1-Click Lazy Replies:</strong> (Click to copy)</div>';
  const grid = document.createElement('div');
  grid.className = 'lazy-replies-grid';

  replyLines.forEach(reply => {
    const btn = document.createElement('button');
    btn.className = 'lazy-reply-pill';
    btn.innerHTML = `<span>💬 "${reply}"</span> <small>Copy</small>`;
    btn.onclick = () => window.copyText(btn, reply);
    grid.appendChild(btn);
  });

  container.appendChild(grid);
}

/* -------------------------------------------------------------
 * MODULE 2: Offline Wind-Down & Soundscape Sanctuary
 * ------------------------------------------------------------- */
function setupSoundscapeModule() {
  const masterToggle = document.getElementById('soundscape-master-toggle');
  const masterIcon = document.getElementById('master-sound-icon');
  const masterText = document.getElementById('master-sound-text');

  // Sliders
  const rainSlider = document.getElementById('vol-rain');
  const binSlider = document.getElementById('vol-binaural');
  const windSlider = document.getElementById('vol-wind');
  const vinylSlider = document.getElementById('vol-vinyl');

  // Master Play/Pause
  if (masterToggle) {
    masterToggle.addEventListener('click', () => {
      const isPlaying = window.soundscapeEngine.togglePlay();
      if (isPlaying) {
        masterToggle.classList.add('playing');
        if (masterIcon) masterIcon.innerText = '⏸';
        if (masterText) masterText.innerText = 'Pause Sanctuary';
        showToast('Soundscape playing live via Web Audio synthesis (0 MB streamed) 🎧');
      } else {
        masterToggle.classList.remove('playing');
        if (masterIcon) masterIcon.innerText = '▶';
        if (masterText) masterText.innerText = 'Play Ambient Soundscape';
      }
    });
  }

  // Volume slider events
  const bindSlider = (slider, chName) => {
    if (!slider) return;
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      window.soundscapeEngine.setChannelVolume(chName, val);
    });
  };

  bindSlider(rainSlider, 'rain');
  bindSlider(binSlider, 'binaural');
  bindSlider(windSlider, 'wind');
  bindSlider(vinylSlider, 'vinyl');

  // Preset buttons
  const presetBtns = document.querySelectorAll('.sound-preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      const target = window.soundscapeEngine.applyPreset(presetKey);

      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (rainSlider) rainSlider.value = target.rain;
      if (binSlider) binSlider.value = target.binaural;
      if (windSlider) windSlider.value = target.wind;
      if (vinylSlider) vinylSlider.value = target.vinyl;

      if (!window.soundscapeEngine.isPlaying) {
        masterToggle.click();
      } else {
        showToast(`Preset loaded: ${btn.innerText}`);
      }
    });
  });

  // Sleep Timer dropdown
  const timerSelect = document.getElementById('sleep-timer-select');
  const timerDisplay = document.getElementById('sleep-timer-display');
  if (timerSelect) {
    timerSelect.addEventListener('change', (e) => {
      const mins = parseInt(e.target.value, 10);
      window.soundscapeEngine.setSleepTimer(
        mins,
        (remainingSeconds) => {
          if (!timerDisplay) return;
          if (remainingSeconds <= 0) {
            timerDisplay.innerText = '';
          } else {
            const m = Math.floor(remainingSeconds / 60);
            const s = remainingSeconds % 60;
            timerDisplay.innerText = `⏳ Sleeping in ${m}:${s < 10 ? '0' : ''}${s}`;
          }
        },
        () => {
          if (masterToggle) masterToggle.classList.remove('playing');
          if (masterIcon) masterIcon.innerText = '▶';
          if (masterText) masterText.innerText = 'Play Ambient Soundscape';
          showToast('Sleep timer finished. Rest well, sloth friend. 🌙');
        }
      );
    });
  }

  // Bedtime Story Generator
  const storyThemeInput = document.getElementById('story-theme-input');
  const storyBtn = document.getElementById('generate-story-btn');
  const storyOutput = document.getElementById('story-output');
  const randomStoryBtn = document.getElementById('random-story-btn');

  if (randomStoryBtn) {
    randomStoryBtn.addEventListener('click', () => {
      const stories = window.SLOAN_SAMPLES.stories;
      const pick = stories[Math.floor(Math.random() * stories.length)];
      if (storyThemeInput) storyThemeInput.value = pick;
    });
  }

  if (storyBtn) {
    storyBtn.addEventListener('click', async () => {
      const theme = (storyThemeInput.value || '').trim() || 'A sleepy sloth resting on a mossy branch while warm rain falls';
      storyBtn.disabled = true;
      storyBtn.innerHTML = '<span class="spinner"></span> Generating Bedtime Story...';
      storyOutput.innerHTML = '<div class="streaming-placeholder">🌙 Crafting a calm, slow-paced offline bedtime story...</div>';

      // Auto-start ambient soundscape in Slumber mode if not already playing
      if (!window.soundscapeEngine.isPlaying && masterToggle) {
        window.soundscapeEngine.applyPreset('slumber');
        masterToggle.click();
      }

      const systemPrompt = `You are a gentle, hypnotic storyteller for International Sloth Day.
Write a calming, slow-paced, atmospheric bedtime story that helps the listener unwind and drift off to sleep.
Use rich, comforting sensory details: soft rain on broad leaves, mossy tree branches, warm herbal tea, twilight skies, gentle night breezes.
Keep sentences soothing, gentle, and rhythmic. Length: around 250 words.`;

      const userPrompt = `Please tell me a bedtime story about: ${theme}`;

      try {
        await window.ollamaClient.generateStream({
          prompt: userPrompt,
          system: systemPrompt,
          temperature: 0.7,
          onToken: (tok, accum) => {
            storyOutput.innerHTML = renderSimpleMarkdown(accum);
          },
          onDone: (final) => {
            storyBtn.disabled = false;
            storyBtn.innerHTML = '🌙 Generate Bedtime Story';
            EnergyTracker.addSavings({ wordsInput: 20, wordsOutput: final.split(/\s+/).length });
          },
          onError: (err) => {
            storyBtn.disabled = false;
            storyBtn.innerHTML = '🌙 Generate Bedtime Story';
            storyOutput.innerHTML = `<div class="error-banner">Story generation error: ${err.message}</div>`;
          }
        });
      } catch (err) {
        storyBtn.disabled = false;
        storyBtn.innerHTML = '🌙 Generate Bedtime Story';
      }
    });
  }
}

/* -------------------------------------------------------------
 * MODULE 3: The Lazy Declutterer & Rename Engine
 * ------------------------------------------------------------- */
function setupDeclutterModule() {
  const inputEl = document.getElementById('declutter-input');
  const submitBtn = document.getElementById('declutter-submit-btn');
  const outputEl = document.getElementById('declutter-output');
  const sampleDownloadsBtn = document.getElementById('sample-downloads-btn');
  const sampleDesktopBtn = document.getElementById('sample-desktop-btn');

  if (sampleDownloadsBtn) {
    sampleDownloadsBtn.addEventListener('click', () => {
      inputEl.value = window.SLOAN_SAMPLES.declutter.messyDownloads;
      showToast('Loaded Messy Downloads list');
    });
  }

  if (sampleDesktopBtn) {
    sampleDesktopBtn.addEventListener('click', () => {
      inputEl.value = window.SLOAN_SAMPLES.declutter.messyDesktop;
      showToast('Loaded Messy Desktop list');
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const text = (inputEl.value || '').trim();
      if (!text) {
        showToast('Please paste a list of filenames or choose a sample preset.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Organizing Clutter...';
      outputEl.innerHTML = '<div class="streaming-placeholder">📂 Analyzing files, categorizing, and drafting rename scripts...</div>';

      const systemPrompt = `You are Sloan's automated decluttering agent.
Given a list of messy, unorganized file names from a user's machine, organize them cleanly:
1. Group them into sensible semantic folders (e.g., Invoices, Screenshots, Installers, Audio, Code).
2. Propose clean, standardized human-readable names for messy files.
3. Generate an instant 1-click Windows PowerShell script that creates the folders and moves/renames the files.
4. Also generate a companion Bash/zsh script for macOS/Linux users.

Keep it clean, beautifully formatted with markdown tables and code blocks.`;

      const userPrompt = `Here is the list of messy files to organize:\n\n${text}`;

      try {
        await window.ollamaClient.generateStream({
          prompt: userPrompt,
          system: systemPrompt,
          temperature: 0.4,
          onToken: (tok, accum) => {
            outputEl.innerHTML = renderSimpleMarkdown(accum);
          },
          onDone: (final) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '📂 Declutter & Generate Scripts';
            EnergyTracker.addSavings({ wordsInput: text.split(/\s+/).length, wordsOutput: final.split(/\s+/).length });
          },
          onError: (err) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '📂 Declutter & Generate Scripts';
            outputEl.innerHTML = `<div class="error-banner">Declutter error: ${err.message}</div>`;
          }
        });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '📂 Declutter & Generate Scripts';
      }
    });
  }
}

/* -------------------------------------------------------------
 * MODULE 4: Fridge to Feast (Minimal-Effort Chef)
 * ------------------------------------------------------------- */
function setupFridgeModule() {
  const inputEl = document.getElementById('fridge-input');
  const submitBtn = document.getElementById('fridge-submit-btn');
  const outputEl = document.getElementById('fridge-output');
  const samplePills = document.querySelectorAll('.fridge-sample-pill');

  samplePills.forEach((pill, idx) => {
    pill.addEventListener('click', () => {
      const samples = window.SLOAN_SAMPLES.fridge;
      if (samples[idx]) {
        inputEl.value = samples[idx];
        showToast(`Loaded: ${samples[idx]}`);
      }
    });
  });

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const ingredients = (inputEl.value || '').trim();
      if (!ingredients) {
        showToast('Please type your random ingredients or click a sample pill.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Inventing Lazy Recipe...';
      outputEl.innerHTML = '<div class="streaming-placeholder">🥑 Sloan is finding the recipe with the fewest dishes to wash...</div>';

      const systemPrompt = `You are Sloan, the ultimate lazy chef who prioritizes low-effort, delicious comfort food made from random fridge scraps.
Rules:
- Prep time must be under 5 minutes.
- Cook time under 10 minutes.
- Total dishes to wash: MAXIMUM 1 (one pan or one bowl).
- Tone: Encouraging, relaxed, slightly humorous.

Format:
### 🥑 Recipe Title
**Effort Score:** 1/10 (Super Sloth) | **Dishes:** 1 pan | **Time:** 7 mins

#### 🛒 Ingredients Used:
- List items with minimal prep

#### 🍳 The 3 Lazy Steps:
1. Step one
2. Step two
3. Step three

#### 🦥 Sloth Tip:
A witty tip on how to eat it straight from the pan or avoid washing an extra fork.`;

      const userPrompt = `Here is what I have in my kitchen:\n${ingredients}`;

      try {
        await window.ollamaClient.generateStream({
          prompt: userPrompt,
          system: systemPrompt,
          temperature: 0.6,
          onToken: (tok, accum) => {
            outputEl.innerHTML = renderSimpleMarkdown(accum);
          },
          onDone: (final) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🥑 Invent Lazy Recipe';
            EnergyTracker.addSavings({ wordsInput: ingredients.split(/\s+/).length, wordsOutput: final.split(/\s+/).length });
          },
          onError: (err) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🥑 Invent Lazy Recipe';
            outputEl.innerHTML = `<div class="error-banner">Chef error: ${err.message}</div>`;
          }
        });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🥑 Invent Lazy Recipe';
      }
    });
  }
}
