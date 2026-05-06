# DenominatorCLI

A conversational AI agent that runs in your terminal. Give it a natural language instruction and it reasons step-by-step, uses tools, and produces real output files.

**[Live Demo](https://denominator-cli-411746695116.asia-south1.run.app)** | **[YouTube Walkthrough](https://youtu.be/PLACEHOLDER)**

---

## Quick Start

```bash
git clone https://github.com/mist-ic/denominatorCLI.git
cd denominatorCLI
npm install
cp .env.example .env   # add your GEMINI_API_KEY
npm start
```

Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).

---

## What It Does

Type something like `Clone the Scaler Academy website` and the agent will:

1. Fetch the real website HTML using `curl`
2. Analyze the DOM structure: nav items, hero text, brand colors, footer links
3. Write a production-quality HTML/CSS/JS clone to `output/index.html`
4. Verify the file exists and open it in your browser

The agent loops through THINK and TOOL steps until the task is complete. It never does everything in a single step.

---

## Agent Loop

| Step | What happens |
|------|-------------|
| **START** | Agent reads the task and plans its approach |
| **THINK** | Agent reasons about the next action (multiple rounds) |
| **TOOL** | Agent calls a tool and waits for the result |
| **OBSERVE** | System returns the tool output back to the agent |
| **OUTPUT** | Agent delivers the final answer and stops |

---

## Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `executeCommand` | `cmd` | Run any shell command |
| `writeFile` | `filePath`, `content` | Write to a file, creates parent dirs |
| `readFile` | `filePath` | Read a file's contents |
| `listFiles` | `dirPath` | List files in a directory |

---

## Tech Stack

| | |
|--|--|
| **Runtime** | Node.js (ES Modules) |
| **LLM** | Gemini 3 Flash (`gemini-3-flash-preview`) via OpenAI-compatible API |
| **Agent Pattern** | ReAct loop with JSON-structured reasoning |
| **Hosting** | GCP Cloud Run |

---

## Project Structure

```
denominatorCLI/
├── index.js          # Agent loop, tool dispatch, CLI
├── package.json
├── .env.example      # Copy to .env and add GEMINI_API_KEY
└── .gitignore
```

---

## Author

Praveen Kumar - 24bcs10048
