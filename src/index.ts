import { query } from "@anthropic-ai/claude-agent-sdk";
import { Command } from "commander";

interface AgentOptions {
	extraSystemPrompt?: string;
	cwd: string;
}

async function runAgent(task: string, options: AgentOptions) {
	// Ensure API key is set
	const apiKey = process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
		console.log(
			"Please set your API key: export ANTHROPIC_API_KEY=your_api_key",
		);
		process.exit(1);
	}

	// Agentic loop: streams messages as Claude works
	for await (const message of query({
		prompt: task,
		options: {
			allowedTools: ["Read", "Edit", "Write", "Glob", "Bash", "Grep"],
			permissionMode: "acceptEdits",
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append: `\n\n${options.extraSystemPrompt || ""}`,
			},
			cwd: options.cwd,
		},
	})) {
		// Print human-readable output
		if (message.type === "assistant" && message.message?.content) {
			for (const block of message.message.content) {
				if ("text" in block) {
					console.log(block.text); // Claude's reasoning
				} else if ("name" in block) {
					console.log(`[Tool: ${block.name}]`); // Tool being called
				}
			}
		} else if (message.type === "result") {
			console.log(`\n---\nDone: ${message.subtype}`); // Final result
		}
	}
}

// Set up CLI
const program = new Command();

program
	.name("agent")
	.description("Run Claude Agent SDK with custom tasks and system prompts")
	.version("1.0.0")
	.argument("<task>", "The task for Claude to perform")
	.option(
		"-e, --extraSystemPrompt <prompt>",
		"Extra system prompt to append to the task",
	)
	.option("-c, --cwd <path>", "The current working directory", process.cwd())
	.action((task: string, options: AgentOptions) => {
		runAgent(task, options).catch((error) => {
			console.error(
				"Error running agent:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		});
	});

program.parse();
