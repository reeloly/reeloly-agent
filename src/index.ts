import fs from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import {
	type CanUseTool,
	query,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Command } from "commander";
import pWaitFor from "p-wait-for";

const ANSWERS_DIR = "/tmp/claude-answers";

interface AgentOptions {
	extraSystemPrompt?: string;
	sessionId: string;
	cwd: string;
	continue?: boolean;
}

interface TaskImage {
	path: string;
	mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

async function* generateMessages(
	task: string,
	images: TaskImage[],
	sessionId: string,
): AsyncIterable<SDKUserMessage> {
	// First message
	yield {
		type: "user" as const,
		message: {
			role: "user" as const,
			content: [
				{
					type: "text",
					text: task,
				},
				...images.map((image) => ({
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: image.mediaType,
						data: fs.readFileSync(image.path).toString("base64"),
					},
				})),
			],
		},
		parent_tool_use_id: null,
		session_id: sessionId,
	};
}

const promptForToolApproval: CanUseTool = async (toolName, input, options) => {
	// Auto-allow all tools except AskUserQuestion
	if (toolName !== "AskUserQuestion") {
		return {
			behavior: "allow",
			updatedInput: input,
		};
	}

	const answerFile = `${ANSWERS_DIR}/${options.toolUseID}.json`;

	try {
		// Wait for answer file to appear
		await pWaitFor(
			async () => {
				const file = Bun.file(answerFile);
				return file.exists();
			},
			{
				interval: 500, // Check every 500ms
				// timeout: 300000, // 5 minute timeout
				timeout: 10000, // 10 seconds timeout
			},
		);

		// Read and parse the answer file
		const file = Bun.file(answerFile);
		const content = (await file.json()) as { answers: Record<string, string> };
		const answers = content.answers;

		// Clean up the answer file
		await unlink(answerFile);

		return {
			behavior: "allow",
			updatedInput: { ...input, answers },
		};
	} catch (error) {
		console.error({
			message: "Error waiting for answer file",
			error,
		});
		return {
			behavior: "deny",
			message: "Error waiting for answer file",
		};
	}
};

async function runAgent(
	task: string,
	images: TaskImage[],
	options: AgentOptions,
) {
	// Ensure answers directory exists for AskUserQuestion responses
	await mkdir(ANSWERS_DIR, { recursive: true });

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
		prompt: generateMessages(task, images, options.sessionId),
		options: {
			allowedTools: [
				"Skill",
				"Read",
				"Edit",
				"Write",
				"Glob",
				"Bash",
				"Grep",
				"AskUserQuestion",
			],
			permissionMode: "bypassPermissions",
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append: `\n\n${options.extraSystemPrompt || ""}`,
			},
			cwd: options.cwd,
			continue: options.continue,
			includePartialMessages: true,
			settingSources: ["user", "project"],
			canUseTool: async (toolName, input, options) => {
				return await promptForToolApproval(toolName, input, options);
			},
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
	.option(
		"-e, --extraSystemPrompt <prompt>",
		"Extra system prompt to append to the task",
	)
	.option("-c, --cwd <path>", "The current working directory", process.cwd())
	.option("-k, --continue", "Continue the task", false)
	.option("-s, --sessionId <id>", "The session ID", "")
	.action((options: AgentOptions) => {
		// Get the task from the environment variable to avoid complex quoting/escaping issues
		const task = process.env.TASK_INPUT;
		if (!task) {
			console.error("Error: TASK_INPUT environment variable is not set");
			process.exit(1);
		}

		const taskImagesEnv = process.env.TASK_IMAGES;
		let images: TaskImage[] = [];
		if (taskImagesEnv) {
			try {
				images = JSON.parse(taskImagesEnv) as TaskImage[];
			} catch (error) {
				console.error({
					message: "Error parsing TASK_IMAGES environment variable",
					error,
				});
				process.exit(1);
			}
		}

		runAgent(task, images, options).catch((error) => {
			console.error(
				"Error running agent:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		});
	});

program.parse();
