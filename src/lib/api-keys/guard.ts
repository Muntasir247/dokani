import { NextResponse, type NextRequest } from "next/server";
import { ApiKeyService, type ApiKeyVerificationResult } from "./index";

export interface AuthenticatedApiContext {
  tenantId: string;
  keyId: string;
  name?: string;
  scopes: string[];
}

/**
 * Extracts and verifies the API key from request headers.
 * Supports:
 * - Authorization: Bearer dk_live_...
 * - X-API-Key: dk_live_...
 */
export async function authenticateApiKey(
  req: NextRequest,
  requiredScope?: string
): Promise<{ auth?: AuthenticatedApiContext; errorResponse?: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");

  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (xApiKey) {
    token = xApiKey.trim();
  }

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        {
          error: "Unauthorized",
          message: "Missing API key. Provide via 'Authorization: Bearer <key>' or 'X-API-Key: <key>' header.",
        },
        { status: 401 }
      ),
    };
  }

  const result: ApiKeyVerificationResult = await ApiKeyService.verifyApiKey(token);

  if (!result.valid || !result.tenantId || !result.keyId) {
    const status = result.reason === "plan_restricted" ? 403 : 401;
    return {
      errorResponse: NextResponse.json(
        {
          error: result.reason === "plan_restricted" ? "Forbidden" : "Unauthorized",
          message: result.error || "Invalid API key",
          code: result.reason,
        },
        { status }
      ),
    };
  }

  // Verify scope if specified
  if (requiredScope) {
    const scopes = result.scopes || [];
    const hasScope = scopes.includes(requiredScope) || scopes.includes("*") || scopes.includes("admin");
    if (!hasScope) {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Forbidden",
            message: `API key lacks required scope: '${requiredScope}'`,
            grantedScopes: scopes,
          },
          { status: 403 }
        ),
      };
    }
  }

  return {
    auth: {
      tenantId: result.tenantId,
      keyId: result.keyId,
      name: result.name,
      scopes: result.scopes || [],
    },
  };
}
