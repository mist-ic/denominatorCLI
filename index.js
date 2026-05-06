import "dotenv/config";
import { OpenAI } from "openai";
import { exec } from "child_process";
import { createInterface } from "readline";
import fs from "fs";
import path from "path";

// ── Gemini via OpenAI-compatible endpoint ──────────────────────────────
const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

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
    const content = fs.readFileSync(filePath, "utf-8");
    return content;
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
    description: "Execute a shell command on the user's machine.",
  },
  writeFile: {
    fn: writeFile,
    parse: (args) => [args.filePath || args.path, args.content],
    description: "Write content to a file. Creates parent directories if needed.",
  },
  readFile: {
    fn: readFile,
    parse: (args) => [args.filePath || args.path],
    description: "Read the contents of a file.",
  },
  listFiles: {
    fn: listFiles,
    parse: (args) => [args.dirPath || args.path || "."],
    description: "List files and directories at the given path.",
  },
};

// ── System prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are DenominatorCLI — an AI agent running in a terminal that clones websites by reasoning step-by-step.
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
1. Always respond with exactly ONE JSON object per step — no extra text.
2. Loop: START → THINK (multiple) → TOOL → OBSERVE → THINK → ... → OUTPUT.
3. After every TOOL step, stop immediately and wait for the OBSERVE result.
4. NEVER skip THINK steps — reason before every action.
5. OUTPUT is your final message to the user.

Website Cloning Strategy (follow this pipeline when asked to clone a site):
Step 1 — FETCH: Use executeCommand with curl to get the real website HTML.
         Example: executeCommand({ cmd: "curl -sL --max-time 15 https://www.scaler.com" })
Step 2 — ANALYZE: Read the fetched HTML to identify:
         - Navigation links and logo placement (header structure)
         - Hero headline, subheadline, CTA button text and colors
         - Footer columns, links, and copyright text
         - Primary brand colors, fonts, and overall design language
Step 3 — GENERATE: Write a single production-quality HTML file to output/index.html that:
         - Replicates the visual structure: header with nav, hero section, footer
         - Uses inline CSS with the real brand colors and fonts detected
         - Is fully self-contained (no external asset dependencies that would break)
         - Looks visually close to the real site when opened in a browser
Step 4 — VERIFY: Use listFiles and readFile to confirm the output file was written correctly.
Step 5 — OPEN: Use executeCommand to open the file in the browser (start output/index.html on Windows).

Output format (one JSON object per message):
{ "step": "START" | "THINK" | "TOOL" | "OUTPUT", "content": "string", "tool_name": "string (only for TOOL)", "tool_args": { ... } (only for TOOL) }

Example:
User: Clone the Scaler Academy website
{ "step": "START", "content": "User wants me to clone the Scaler Academy website. I will fetch the real site, analyze its structure, then generate an accurate HTML clone." }
{ "step": "THINK", "content": "First I need to fetch the real Scaler website HTML so I can see the actual nav items, hero text, colors, and footer structure." }
{ "step": "TOOL", "tool_name": "executeCommand", "tool_args": { "cmd": "curl -sL --max-time 15 https://www.scaler.com" } }
// OBSERVE returns raw HTML
{ "step": "THINK", "content": "I can see the nav has: Courses, Topics, Events, Blog. The hero says 'Become a software developer...'. Brand color is dark navy #1a1a2e. CTA is orange. Footer has columns for Courses, Topics, Company. Now I will write the clone." }
{ "step": "TOOL", "tool_name": "writeFile", "tool_args": { "filePath": "output/index.html", "content": "<!DOCTYPE html>..." } }
// OBSERVE returns success
{ "step": "THINK", "content": "File written. Let me verify it exists and then open it." }
{ "step": "TOOL", "tool_name": "listFiles", "tool_args": { "dirPath": "output" } }
// OBSERVE returns [FILE] index.html
{ "step": "OUTPUT", "content": "Scaler Academy clone created at output/index.html. Open it in your browser to view the result." }
`;


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
  white: "\x1b[37m",
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
        const preview =
          typeof parsed.tool_args === "string"
            ? parsed.tool_args
            : JSON.stringify(parsed.tool_args, null, 2);
        // Truncate long previews
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
        `${COLORS.blue}   👁 OBSERVE → ${COLORS.reset}${COLORS.dim}${content.substring(0, 200)}${content.length > 200 ? "..." : ""}${COLORS.reset}`
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

// ── Agent loop ─────────────────────────────────────────────────────────

async function runAgent(userMessage, messages) {
  messages.push({ role: "user", content: userMessage });

  let iterations = 0;
  const MAX_ITERATIONS = 30;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: messages,
    });

    const raw = response.choices[0].message.content;
    let parsedRaw;

    try {
      parsedRaw = JSON.parse(raw);
    } catch {
      // Try to extract first JSON object or array from raw text
      const match = raw.match(/(\[|\{)[\s\S]*(\]|\})/);
      if (match) {
        try {
          parsedRaw = JSON.parse(match[0]);
        } catch {
          console.log(`${COLORS.red}Failed to parse response: ${raw.substring(0, 200)}${COLORS.reset}`);
          messages.push({ role: "assistant", content: raw });
          continue;
        }
      } else {
        console.log(`${COLORS.red}No JSON found in response${COLORS.reset}`);
        messages.push({ role: "assistant", content: raw });
        continue;
      }
    }

    // Gemini sometimes returns all steps as an array — unwrap and process each
    const stepQueue = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw];

    for (const parsed of stepQueue) {
      if (!parsed || typeof parsed !== "object" || !parsed.step) continue;

      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      printStep(parsed);

      if (parsed.step === "OUTPUT") {
        return parsed.content;
      }

      if (parsed.step === "TOOL") {
        const toolName = parsed.tool_name;
        const toolDef = tools[toolName];

        let result;
        if (!toolDef) {
          result = `Error: Tool "${toolName}" is not available. Available tools: ${Object.keys(tools).join(", ")}`;
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
        messages.push({
          role: "user",
          content: JSON.stringify(observe),
        });
      }
    }

    // After draining the stepQueue, check if any step was OUTPUT
    if (stepQueue.some((s) => s && s.step === "OUTPUT")) {
      return stepQueue.find((s) => s && s.step === "OUTPUT").content;
    }

  }

  console.log(`${COLORS.red}Agent exceeded maximum iterations (${MAX_ITERATIONS}).${COLORS.reset}`);
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

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

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
        await runAgent(trimmed, messages);
      } catch (err) {
        console.log(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
      }

      prompt();
    });
  };

  prompt();
}

main();
