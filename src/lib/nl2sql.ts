import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { getServiceClient } from "./supabase";
import { DB_SCHEMA } from "./db-schema";

// SQL validation -- only allow SELECT queries.
// Exported so the test suite validates the REAL guard instead of a replica
// that silently drifts behind it (the security boundary must be tested).
export function validateSQL(sql: string): { valid: boolean; error?: string } {
  // Strip both `-- line comments` and `/* block comments */` before validating
  // so an attacker can't smuggle DML past the keyword check by hiding it
  // inside a comment.
  const stripped = sql
    .replace(/--[^\n\r]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const trimmed = stripped.trim().toUpperCase();

  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return { valid: false, error: "Only SELECT queries are allowed" };
  }

  // Disallow multi-statement payloads. Strip a single trailing semicolon
  // but reject anything else with `;` mid-query.
  const withoutTrailingSemi = trimmed.replace(/;+\s*$/, "");
  if (withoutTrailingSemi.includes(";")) {
    return { valid: false, error: "Multiple statements are not allowed" };
  }

  const blocked = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "GRANT", "REVOKE", "EXECUTE", "EXEC", "MERGE", "REPLACE", "CALL",
  ];
  for (const keyword of blocked) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(stripped)) {
      return { valid: false, error: `Query contains blocked keyword: ${keyword}` };
    }
  }

  return { valid: true };
}

export interface NL2SQLResult {
  query: string;
  sql: string;
  data: Record<string, unknown>[];
  rowCount: number;
  explanation: string;
  error?: string;
}

export async function executeNL2SQL(
  question: string,
  conversationContext?: string,
): Promise<NL2SQLResult> {
  // Step 1: Generate SQL from natural language
  const { text: sqlResponse } = await generateText({
    model: anthropic("claude-sonnet-5"),
    system: `You are an expert SQL query generator for a Formula 1 racing database.
Given a natural language question, generate a PostgreSQL query that answers it.

${DB_SCHEMA}

RULES:
1. Return ONLY the SQL query -- no explanation, no markdown, no backticks
2. Always use SELECT -- never mutate data
3. Use meaningful column aliases
4. LIMIT to 50 rows unless specified
5. Order results logically (by position, time, date, etc.)
6. Handle NULL values with COALESCE where appropriate
7. When comparing drivers, include both driver names in output
8. For lap times, return both raw seconds and formatted time
9. If the question is ambiguous, make reasonable assumptions and include a wider result set

${conversationContext ? "Previous conversation context:\n" + conversationContext : ""}`,
    prompt: question,
    maxOutputTokens: 1000,
  });

  // Clean up the SQL (remove markdown backticks if any)
  let sql = sqlResponse.trim();
  if (sql.startsWith("```")) {
    sql = sql
      .replace(/^```(?:sql)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }

  // Step 2: Validate SQL
  const validation = validateSQL(sql);
  if (!validation.valid) {
    return {
      query: question,
      sql,
      data: [],
      rowCount: 0,
      explanation: "",
      error: validation.error,
    };
  }

  // Step 3: Execute against Supabase
  const client = getServiceClient();
  try {
    const { data, error } = await client.rpc("exec_sql", { query: sql });

    if (error) {
      return {
        query: question,
        sql,
        data: [],
        rowCount: 0,
        explanation: "",
        error: `Database error: ${error.message}`,
      };
    }

    // Step 4: Generate natural language explanation
    const { text: explanation } = await generateText({
      model: anthropic("claude-sonnet-5"),
      system:
        "You are F1 Pulse AI. Briefly summarize the query results in 1-2 sentences with key highlights. Use driver codes (VER, HAM) and format times as M:SS.mmm. Be concise and data-focused.",
      prompt: `Question: ${question}\nSQL: ${sql}\nResults (first 10 rows): ${JSON.stringify(Array.isArray(data) ? data.slice(0, 10) : data)}\n\nSummarize the key findings:`,
      maxOutputTokens: 200,
    });

    const resultArray: Record<string, unknown>[] = Array.isArray(data) ? data : [data];

    return {
      query: question,
      sql,
      data: resultArray,
      rowCount: resultArray.length,
      explanation,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Query execution failed";
    return {
      query: question,
      sql,
      data: [],
      rowCount: 0,
      explanation: "",
      error: message,
    };
  }
}
