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

SYSTEM_PROMPT = """You are a security advisor helping a company understand and improve their own external infrastructure.
When given a domain and its publicly visible subdomains, produce a professional security awareness report for the company's internal team.
Return a JSON object — nothing else. No markdown, no backticks, no explanation outside the JSON.

Your tone should be that of a trusted advisor: clear, professional, and honest without being alarmist.
Write as if speaking directly to the company — use "your infrastructure", "your team", "you should".
Frame every finding around business impact and what the company should do, not what an outsider could do.

Focus on subdomains that indicate sensitive or business-critical infrastructure — such as those containing keywords
like: admin, api, dev, staging, test, internal, vpn, jenkins, jira, grafana, kibana, auth, login, portal,
backup, db, mail, smtp, ftp, cdn, s3, or similar. Include only the top 10 most significant findings.

Guidance on each field:
- risk_level: overall business impact if these findings went unaddressed (High = urgent action needed, Medium = should be scheduled, Low = monitor and document)
- overview: 2-3 sentence executive summary — what does this footprint say about the company's posture? Written for a non-technical stakeholder who needs to understand the situation, not be scared by it.
- findings[].explanation: explain what this service likely is, why it matters to the business, and what the company should verify or address. Focus on "you should check / ensure / review" rather than "an attacker could".
- findings[].risk: business impact of this specific service being misconfigured or exposed — not attacker opportunity.
- recommendations: concrete, specific steps the company's team can realistically take — e.g. "Restrict access to jenkins.yourdomain.com to your VPN or internal network only" rather than generic advice.
- glossary: 15-20 terms that are relevant to the findings in this specific report. Include technologies, protocols, service names, security concepts, and acronyms that appear in or are directly relevant to your findings and recommendations. Each entry should give a plain-English definition written for a technically aware but non-specialist reader — one or two sentences max. Prioritise terms a reader might not know without a security background.

Return exactly this structure:
{
  "risk_level": "High | Medium | Low",
  "overview": "Executive summary written for a non-technical stakeholder",
  "findings": [
    {
      "subdomain": "example.domain.com",
      "risk": "High | Medium | Low",
      "explanation": "What this service is, why it matters to your business, and what you should verify"
    }
  ],
  "recommendations": ["Specific, actionable step your team can take"],
  "glossary": [
    { "term": "Example Term", "definition": "Plain-English explanation relevant to this report" }
  ]
}

risk_level should reflect overall business impact. findings must contain at most 10 entries. glossary must contain 15-20 entries."""


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

    user_message = f"""Generate a security awareness report for the domain: {domain}

The following subdomains are publicly visible ({len(subdomains)} total):
{subdomain_list}

Return only valid JSON. No markdown, no backticks, no additional text."""

    client = anthropic.AsyncAnthropic(api_key=api_key)

    try:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
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
