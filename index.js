import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import { createInterface } from "readline";
import fs from "fs";
import path from "path";

// ── Native @google/genai client ────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3-flash-preview";

// ── Tool implementations ───────────────────────────────────────────────

/**
 * Execute a shell command and return stdout/stderr.
 */
function executeCommand(cmd = "") {
  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        resolve(`Error: ${error.message}\n${stderr}`);
      } else {
        resolve(stdout || stderr || "Command executed successfully (no output).");
      }
    });
  });
}

/**
 * Write content to a file, creating directories as needed.
 */
function writeFile(filePath = "", content = "") {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf-8");
    return `File written successfully: ${filePath}`;
  } catch (err) {
    return `Error writing file: ${err.message}`;
  }
}

/**
 * Read a file's contents.
 */
function readFile(filePath = "") {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
}

/**
 * List files in a directory.
 */
function listFiles(dirPath = ".") {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return items
      .map((item) => `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`)
      .join("\n");
  } catch (err) {
    return `Error listing directory: ${err.message}`;
  }
}

// ── Tool registry ──────────────────────────────────────────────────────

const tools = {
  executeCommand: {
    fn: executeCommand,
    parse: (args) => [args.cmd || args.command || args],
  },
  writeFile: {
    fn: writeFile,
    parse: (args) => [args.filePath || args.path, args.content],
  },
  readFile: {
    fn: readFile,
    parse: (args) => [args.filePath || args.path],
  },
  listFiles: {
    fn: listFiles,
    parse: (args) => [args.dirPath || args.path || "."],
  },
};

// ── System prompt ──────────────────────────────────────────────────────
// Goes into config.systemInstruction (NOT in contents) per models.md

const SYSTEM_PROMPT = `You are DenominatorCLI — an AI agent running in a terminal that clones websites by reasoning step-by-step.
You follow a strict loop: START → THINK → TOOL → OBSERVE → OUTPUT.

Context:
- Working directory: ${process.cwd()}
- OS: ${process.platform}

Available tools:
1. executeCommand(cmd: string) — Run any shell command. Returns stdout/stderr.
2. writeFile(filePath: string, content: string) — Write content to a file. Creates parent dirs automatically.
3. readFile(filePath: string) — Read a file's contents.
4. listFiles(dirPath: string) — List files in a directory.

Rules:
1. Always respond with exactly ONE JSON object per response — no extra text, no markdown fences.
2. Loop: START → THINK (multiple) → TOOL → OBSERVE → THINK → ... → OUTPUT.
3. After every TOOL step, stop and wait — the OBSERVE result will arrive in the next message.
4. Never skip THINK steps — reason before every action.
5. OUTPUT is your final message to the user.

Website Cloning Strategy (follow this pipeline for site clone tasks):
Step 1 — FETCH: Use executeCommand to curl the real site HTML.
         Example: { "cmd": "curl -sL --max-time 15 https://www.scaler.com" }
Step 2 — ANALYZE: From the HTML identify nav links, hero headline/subheadline/CTAs, brand colors, footer columns.
Step 3 — GENERATE: Write a single self-contained HTML file to output/index.html.
         Must include: sticky header with real nav items, hero section with real headline and CTAs, scrolling program marquee, footer with real columns and links.
         Use inline CSS only. Use real brand colors from the HTML. No external assets that break offline.
Step 4 — VERIFY: Use listFiles to confirm output/index.html exists.
Step 5 — OPEN: Use executeCommand to open the file in browser (start output/index.html on Windows).

Output format — one JSON object per message, no other text:
{ "step": "START" | "THINK" | "TOOL" | "OUTPUT", "content": "string", "tool_name": "string (only for TOOL)", "tool_args": { ... } }

Example:
User: Clone the Scaler Academy website
{ "step": "START", "content": "User wants a Scaler clone. I will fetch the real site, analyze its structure, then generate an accurate HTML clone." }
{ "step": "THINK", "content": "First I need the real Scaler HTML to extract nav items, hero text, brand colors, and footer structure." }
{ "step": "TOOL", "tool_name": "executeCommand", "tool_args": { "cmd": "curl -sL --max-time 15 https://www.scaler.com" } }
// (system sends OBSERVE with result)
{ "step": "THINK", "content": "I can see nav: PROGRAM, MASTERCLASS, AI LABS, ALUMNI. Hero: 'Become the Professional Built for the Next Decade in AI.' Brand color: #011845 navy, #004CE5 blue. Footer has Explore Scaler, Resources, Company, Socials. Now writing the clone." }
{ "step": "TOOL", "tool_name": "writeFile", "tool_args": { "filePath": "output/index.html", "content": "<!DOCTYPE html>..." } }
// (system sends OBSERVE with success)
{ "step": "TOOL", "tool_name": "listFiles", "tool_args": { "dirPath": "output" } }
// (system sends OBSERVE with [FILE] index.html)
{ "step": "OUTPUT", "content": "Scaler clone created at output/index.html. Open it in your browser." }`;

// ── Pretty-print helpers ───────────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

function printStep(parsed) {
  const step = parsed.step;
  const content = parsed.content || "";

  switch (step) {
    case "START":
      console.log(
        `\n${COLORS.bgCyan}${COLORS.bright} 🚀 START ${COLORS.reset} ${COLORS.cyan}${content}${COLORS.reset}\n`
      );
      break;
    case "THINK":
      console.log(
        `${COLORS.yellow}   💭 THINK → ${COLORS.reset}${COLORS.dim}${content}${COLORS.reset}`
      );
      break;
    case "TOOL":
      console.log(
        `\n${COLORS.bgMagenta}${COLORS.bright} 🔧 TOOL ${COLORS.reset} ${COLORS.magenta}${parsed.tool_name}${COLORS.reset}`
      );
      if (parsed.tool_args) {
        const preview = JSON.stringify(parsed.tool_args, null, 2);
        const lines = preview.split("\n");
        if (lines.length > 8) {
          console.log(
            `${COLORS.dim}   ${lines.slice(0, 6).join("\n   ")}\n   ... (${lines.length - 6} more lines)${COLORS.reset}`
          );
        } else {
          console.log(`${COLORS.dim}   ${preview.replace(/\n/g, "\n   ")}${COLORS.reset}`);
        }
      }
      break;
    case "OBSERVE":
      console.log(
        `${COLORS.blue}   👁 OBSERVE → ${COLORS.reset}${COLORS.dim}${String(content).substring(0, 200)}${String(content).length > 200 ? "..." : ""}${COLORS.reset}`
      );
      break;
    case "OUTPUT":
      console.log(
        `\n${COLORS.bgGreen}${COLORS.bright} ✅ OUTPUT ${COLORS.reset}\n${COLORS.green}${content}${COLORS.reset}\n`
      );
      break;
    default:
      console.log(`${COLORS.dim}   ${JSON.stringify(parsed)}${COLORS.reset}`);
  }
}

// ── JSON extraction ────────────────────────────────────────────────────
// Mirrors retrofit's extract_json utility — handles clean JSON, arrays,
// and any stray text that might surround the JSON object.

function extractJson(text) {
  if (!text) throw new Error("Empty response text");

  // 1. Direct parse (happy path)
  try {
    return JSON.parse(text);
  } catch (_) {}

  // 2. Strip markdown fences
  const stripped = text.replace(/```(?:json)?\s*/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {}

  // 3. Find first complete JSON object or array using brace matching
  for (const startChar of ["{", "["]) {
    const startIdx = stripped.indexOf(startChar);
    if (startIdx === -1) continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(stripped.slice(startIdx, i + 1));
          } catch (_) {}
        }
      }
    }
  }

  throw new Error(`No valid JSON found. First 200 chars: ${text.slice(0, 200)}`);
}

// ── Agent loop ─────────────────────────────────────────────────────────

async function runAgent(userMessage, contents) {
  // Append user message using the @google/genai content format
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  let iterations = 0;
  const MAX_ITERATIONS = 30;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Call using native SDK — response.text strips thinking tokens automatically.
    // thinkingLevel "low": agent loop externalizes reasoning via THINK steps,
    // so we don't need deep per-step internal thinking (mirrors retrofit's Flash usage).
    // responseMimeType "application/json": forces clean JSON, no markdown wrapping.
    // Temperature: NOT set — must stay at default 1.0 for Gemini 3 (per models.md).
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        thinkingConfig: { thinkingLevel: "low" },
        responseMimeType: "application/json",
      },
    });

    const raw = response.text;
    let parsedRaw;

    try {
      parsedRaw = extractJson(raw);
    } catch (err) {
      console.log(`${COLORS.red}Parse error: ${err.message}${COLORS.reset}`);
      // Push the raw model response back as-is so conversation stays intact
      contents.push({ role: "model", parts: [{ text: raw }] });
      continue;
    }

    // SDK handles thought signatures automatically when we push the full response
    // parts back. We push normalized JSON string as the model turn.
    const normalized = JSON.stringify(parsedRaw);
    contents.push({ role: "model", parts: [{ text: normalized }] });

    // Gemini sometimes batches all steps into an array — unwrap and process each
    const stepQueue = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw];

    for (const parsed of stepQueue) {
      if (!parsed || typeof parsed !== "object" || !parsed.step) continue;

      printStep(parsed);

      if (parsed.step === "OUTPUT") {
        return parsed.content;
      }

      if (parsed.step === "TOOL") {
        const toolName = parsed.tool_name;
        const toolDef = tools[toolName];

        let result;
        if (!toolDef) {
          result = `Error: Tool "${toolName}" is not available. Available: ${Object.keys(tools).join(", ")}`;
        } else {
          try {
            const args = toolDef.parse(
              typeof parsed.tool_args === "string"
                ? parsed.tool_args
                : parsed.tool_args || {}
            );
            result = await toolDef.fn(...args);
          } catch (err) {
            result = `Error executing tool: ${err.message}`;
          }
        }

        const observe = {
          step: "OBSERVE",
          content: typeof result === "object" ? JSON.stringify(result) : String(result),
        };

        printStep(observe);

        // Inject OBSERVE as the next user turn so the model sees the tool result
        contents.push({
          role: "user",
          parts: [{ text: JSON.stringify(observe) }],
        });

        // Break out of stepQueue — each TOOL must wait for OBSERVE before continuing
        break;
      }
    }

    // If any step in the batch was OUTPUT, we already returned above
    if (stepQueue.some((s) => s && s.step === "OUTPUT")) {
      return stepQueue.find((s) => s && s.step === "OUTPUT").content;
    }
  }

  console.log(`${COLORS.red}Agent reached max iterations (${MAX_ITERATIONS}).${COLORS.reset}`);
  return "Agent stopped after maximum iterations.";
}

// ── Interactive CLI ────────────────────────────────────────────────────

async function main() {
  console.log(`
${COLORS.bgBlue}${COLORS.bright}                                          ${COLORS.reset}
${COLORS.bgBlue}${COLORS.bright}   🤖 DenominatorCLI — AI Agent Terminal  ${COLORS.reset}
${COLORS.bgBlue}${COLORS.bright}                                          ${COLORS.reset}

${COLORS.cyan}An AI-powered CLI agent that reasons step-by-step.${COLORS.reset}
${COLORS.dim}Type your instruction and press Enter. Type "exit" to quit.${COLORS.reset}
${COLORS.dim}────────────────────────────────────────────────────────────${COLORS.reset}
`);

  // Contents array persists across turns — conversation memory
  const contents = [];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${COLORS.bright}${COLORS.green}You → ${COLORS.reset}`, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();
      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        console.log(`\n${COLORS.cyan}Goodbye! 👋${COLORS.reset}\n`);
        rl.close();
        process.exit(0);
      }

      try {
        await runAgent(trimmed, contents);
      } catch (err) {
        console.log(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
      }

      prompt();
    });
  };

  prompt();
}

main();
