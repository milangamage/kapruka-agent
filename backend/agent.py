"""
agent.py
--------
KaprukaAgent: GPT-4o powered sales agent.

- Loads all 7 Kapruka MCP tools on startup
- Handles multi-turn conversations with session history
- Runs the tool-call loop: GPT-4o calls tools → gets results → responds
"""

import json
from openai import AsyncOpenAI
from system_prompt import get_system_prompt
from kapruka_mcp import get_kapruka_tools, call_kapruka_tool


class KaprukaAgent:
    """
    The core AI sales agent.
    One shared instance is created at server startup.
    Each user gets their own conversation history (managed in main.py).
    """

    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.tools: list[dict] = []
        self.model = "gpt-4o"

    async def initialize(self):
        """Fetch all Kapruka MCP tools and cache them for the session."""
        print("🔌 Connecting to Kapruka MCP server...")
        self.tools = await get_kapruka_tools()
        print(f"✅ {len(self.tools)} Kapruka tools loaded:")
        for t in self.tools:
            print(f"   → {t['function']['name']}")

    async def chat(
        self,
        user_message: str,
        history: list[dict]
    ) -> tuple[str, list[dict]]:
        """
        Process one user message and return the agent reply + updated history.

        Args:
            user_message : The latest text from the user
            history      : Previous messages for this session (without system prompt)

        Returns:
            (reply_text, updated_history)
        """

        # Build the full message list: system prompt + history + new user message
        # get_system_prompt() injects today's date so the agent can resolve "tomorrow" etc.
        messages = (
            [{"role": "system", "content": get_system_prompt()}]
            + history
            + [{"role": "user", "content": user_message}]
        )

        # ── Agent loop ────────────────────────────────────────────────────
        # GPT-4o may call multiple tools before giving a final answer.
        # We loop until we get a plain text response (no more tool calls).

        MAX_TOOL_ROUNDS = 10  # Safety cap — prevents infinite loops

        for round_num in range(MAX_TOOL_ROUNDS):

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=self.tools or None,
                tool_choice="auto" if self.tools else None,
                temperature=0.3,      # Low temp = consistent sales behaviour
                max_tokens=2048,
            )

            choice = response.choices[0]
            message = choice.message

            # ── Tool calls requested ──────────────────────────────────────
            if message.tool_calls:

                # Append the assistant's tool-call request to the conversation
                messages.append({
                    "role": "assistant",
                    "content": message.content,  # May be None
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in message.tool_calls
                    ],
                })

                # Execute every tool call and append results
                for tc in message.tool_calls:
                    name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}

                    print(f"  🔧 Tool call  : {name}")
                    print(f"     Arguments  : {args}")

                    result_text = await call_kapruka_tool(name, args)

                    print(f"     Result     : {result_text[:120]}{'...' if len(result_text) > 120 else ''}")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_text,
                    })

                # Continue the loop — let GPT-4o process the tool results
                continue

            # ── Final text response ───────────────────────────────────────
            reply = message.content or "I'm sorry, I couldn't generate a response. Please try again."

            # Build the updated history (strip system prompt, add new turns)
            updated_history = (
                history
                + [{"role": "user", "content": user_message}]
                + messages[len(history) + 2:]          # Tool call turns
                + [{"role": "assistant", "content": reply}]
            )

            return reply, updated_history

        # If we hit the loop limit (very unlikely), return a graceful error
        fallback = (
            "I'm sorry, I took too many steps to process your request. "
            "Could you try rephrasing or breaking it into a simpler question?"
        )
        return fallback, history + [{"role": "user", "content": user_message}]
