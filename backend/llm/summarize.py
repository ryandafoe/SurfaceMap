"""
summarize.py — LLM-powered recon summarization via Claude API.

Responsibilities:
- Accept a list of subdomains (and optionally other recon data) as input
- Send the data to Claude via the Anthropic SDK
- Prompt Claude to analyze the attack surface and return structured JSON
- Parse and return the response as a Python dict
- Load the API key from environment variables using python-dotenv

Dependencies: anthropic, python-dotenv
Environment variables: ANTHROPIC_API_KEY
"""

import os
import json
import anthropic
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """You are an expert security researcher specializing in attack surface analysis.
When given a domain and its subdomains, analyze them and return a JSON object — nothing else.
No markdown, no backticks, no explanation outside the JSON.

Focus on subdomains that suggest sensitive or interesting infrastructure — such as those containing keywords
like: admin, api, dev, staging, test, internal, vpn, jenkins, jira, grafana, kibana, auth, login, portal,
backup, db, mail, smtp, ftp, cdn, s3, or similar. Include only the top 10 most interesting findings.

Return exactly this structure:
{
  "risk_level": "High | Medium | Low",
  "overview": "2-3 sentence plain English summary of the attack surface",
  "findings": [
    {
      "subdomain": "example.domain.com",
      "risk": "High | Medium | Low",
      "explanation": "Why this subdomain is interesting to a security researcher"
    }
  ],
  "recommendations": ["actionable step 1", "actionable step 2"]
}

risk_level should reflect the overall severity across all findings. findings must contain at most 10 entries."""


async def summarize_findings(domain: str, subdomains: list[str]) -> dict:
    """
    Use Claude to analyze the attack surface for a given domain and its subdomains.

    Returns a parsed dict matching the structured JSON schema.
    Raises RuntimeError if the API key is missing, the API call fails, or the response is not valid JSON.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in environment variables")

    subdomain_list = "\n".join(f"  - {s}" for s in subdomains) if subdomains else "  (none found)"

    user_message = f"""Analyze the attack surface for the domain: {domain}

Subdomains discovered ({len(subdomains)} total):
{subdomain_list}

Return only valid JSON. No markdown, no backticks, no additional text."""

    client = anthropic.AsyncAnthropic(api_key=api_key)

    try:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
    except anthropic.AuthenticationError:
        raise RuntimeError("Invalid ANTHROPIC_API_KEY — check your .env file")
    except anthropic.APIConnectionError as e:
        raise RuntimeError(f"Failed to connect to Anthropic API: {e}")
    except anthropic.APIStatusError as e:
        raise RuntimeError(f"Anthropic API error {e.status_code}: {e.message}")

    raw = message.content[0].text.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError(f"Claude returned invalid JSON: {raw[:200]}")
