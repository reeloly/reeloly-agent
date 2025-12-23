import { query } from "@anthropic-ai/claude-agent-sdk";
import { Command } from "commander";

interface AgentOptions {
	extraSystemPrompt?: string;
	cwd: string;
	continue?: boolean;
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

	// const decodedTask = Buffer.from(task, "base64").toString("utf-8");

	// Agentic loop: streams messages as Claude works
	for await (const message of query({
		prompt: task,
		options: {
			allowedTools: ["Skill", "Read", "Edit", "Write", "Glob", "Bash", "Grep"],
			permissionMode: "acceptEdits",
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append: `\n\n${options.extraSystemPrompt || ""}`,
			},
			cwd: options.cwd,
			continue: options.continue,
			includePartialMessages: true,
		},
	})) {
		// 	if (message.type === "system" && message.subtype === "init") {
		// 		console.log(`Initializing agent...`);
		// 	} else if (message.type === "assistant" && message.message?.content) {
		// 		for (const block of message.message.content) {
		// 			// if ("text" in block) {
		// 			// 	console.log(block.text); // Claude's reasoning
		// 			// } else if ("name" in block) {
		// 			// 	console.log(`[Tool: ${block.name}]`); // Tool being called
		// 			// }
		// 			if ("name" in block) {
		// 				console.log(`[Tool: ${block.name}]`); // Tool being called
		// 			}
		// 		}
		// 	} else if (
		// 		message.type === "stream_event" &&
		// 		message.event.type === "content_block_delta" &&
		// 		"text" in message.event.delta
		// 	) {
		// 		console.log(message.event.delta.text);
		// 	} else if (message.type === "result") {
		// 		console.log(`\n---\nDone: ${message.subtype}`); // Final result
		// 	}
		const outputMessage = JSON.stringify(message);
		console.log(outputMessage);
	}
}

// Set up CLI
const program = new Command();

program
	.name("agent")
	.description("Run Claude Agent SDK with custom tasks and system prompts")
	.version("1.0.0")
	// .argument("<task>", "The task for Claude to perform")
	.option(
		"-e, --extraSystemPrompt <prompt>",
		"Extra system prompt to append to the task",
	)
	.option("-c, --cwd <path>", "The current working directory", process.cwd())
	.option("-k, --continue", "Continue the task", false)
	.action((options: AgentOptions) => {
		const task = process.env.TASK_INPUT;
		if (!task) {
			console.error("Error: TASK_INPUT environment variable is not set");
			process.exit(1);
		}
		runAgent(task, options).catch((error) => {
			console.error(
				"Error running agent:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		});
	});

program.parse();
