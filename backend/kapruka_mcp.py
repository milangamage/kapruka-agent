"""
kapruka_mcp.py
--------------
MCP client that connects to the Kapruka MCP server and:
  1. Lists all available tools (converted to OpenAI function format)
  2. Calls any tool by name with given arguments
"""

import json
from typing import Any
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

KAPRUKA_MCP_URL = "https://mcp.kapruka.com/mcp"


async def get_kapruka_tools() -> list[dict]:
    """
    Connect to the Kapruka MCP server, list all tools,
    and return them in OpenAI function-calling format.
    """
    async with streamablehttp_client(KAPRUKA_MCP_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()

            openai_tools = []
            for tool in result.tools:
                # Convert MCP tool schema → OpenAI function tool schema
                parameters = tool.inputSchema if tool.inputSchema else {
                    "type": "object",
                    "properties": {}
                }
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description or f"Kapruka tool: {tool.name}",
                        "parameters": parameters
                    }
                })

            return openai_tools


async def call_kapruka_tool(tool_name: str, arguments: dict[str, Any]) -> str:
    """
    Call a specific Kapruka MCP tool with the given arguments.
    Returns the result as a plain string for the LLM to read.
    """
    try:
        async with streamablehttp_client(KAPRUKA_MCP_URL) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments)

                # Extract text from MCP content items
                if result.content:
                    texts = []
                    for item in result.content:
                        if hasattr(item, "text"):
                            texts.append(item.text)
                        elif isinstance(item, dict) and "text" in item:
                            texts.append(item["text"])
                        else:
                            texts.append(str(item))
                    return "\n".join(texts)

                return "Tool returned no content."

    except Exception as e:
        # Return error as string so the agent can handle it gracefully
        return f"Error calling {tool_name}: {str(e)}"
