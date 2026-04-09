#!/bin/bash
# SessionStart hook: output context reminders for Claude
# This output is shown to Claude at the beginning of each session

cat << 'CONTEXT'
[SESSION START REMINDERS]
1. MEMORY: Search your memory (search_nodes) for user preferences and project context
2. SOURCES: NEVER hallucinate academic sources — only use verified search tools
3. CITATIONS: Always verbatim, with exact page numbers
4. STYLE: Academic Russian, no bureaucratese (не "данный", не "является")
5. AGENTS: Available sub-agents: source-finder, citation-checker, document-summarizer
6. TOOLS: pdf-mcp for large PDFs, /research-docs for visual citations, OpenAlex for Russian papers
CONTEXT
